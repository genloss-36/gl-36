use pinocchio::{
    cpi::{Seed, Signer},
    error::ProgramError,
    AccountView, Address, ProgramResult, Resize,
};
use pinocchio_log::log;
use pinocchio_system::instructions::{Allocate, Assign, CreateAccount, Transfer};

use crate::{error::Error, state::*, util::*};

const COLLECTION_SEED: &[u8] = b"col";

#[inline(always)]
fn args_len(args: &[u8], len: usize) -> ProgramResult {
    if args.len() == len {
        Ok(())
    } else {
        Err(ProgramError::InvalidInstructionData)
    }
}

pub fn init(program_id: &Address, accounts: &mut [AccountView], args: &[u8]) -> ProgramResult {
    let [creator, collection, treasury, _system, ..] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };
    args_len(args, 80)?;
    signer(creator)?;

    let nonce = [args[0], args[1], args[2], args[3]];
    let max_supply = read_u16(args, 4);
    let fee_bps = read_u16(args, 6);
    let mint_price = read_u64(args, 8);
    if max_supply == 0 {
        return Err(Error::BadSupply.into());
    }
    if fee_bps > MAX_FEE_BPS {
        return Err(Error::BadFee.into());
    }

    let (pda, bump) = Address::find_program_address(
        &[COLLECTION_SEED, creator.address().as_array(), &nonce],
        program_id,
    );
    if collection.address() != &pda {
        return Err(ProgramError::InvalidSeeds);
    }

    let bump_seed = [bump];
    let seeds = [
        Seed::from(COLLECTION_SEED),
        Seed::from(creator.address().as_array()),
        Seed::from(&nonce),
        Seed::from(&bump_seed),
    ];
    let pda_signer = [Signer::from(&seeds)];
    if collection.lamports() == 0 {
        CreateAccount::with_minimum_balance(creator, collection, HEADER_LEN as u64, program_id, None)?
            .invoke_signed(&pda_signer)?;
    } else {
        let top_up = rent_min(HEADER_LEN)?.saturating_sub(collection.lamports());
        if top_up > 0 {
            Transfer { from: creator, to: collection, lamports: top_up }.invoke()?;
        }
        Allocate { account: collection, space: HEADER_LEN as u64 }.invoke_signed(&pda_signer)?;
        Assign { account: collection, owner: program_id }.invoke_signed(&pda_signer)?;
    }

    let mut d = collection.try_borrow_mut()?;
    d[OFF_TAG] = TAG;
    d[OFF_VERSION] = VERSION;
    d[OFF_BUMP] = bump;
    write_u16(&mut d, OFF_MAX_SUPPLY, max_supply);
    write_u16(&mut d, OFF_FEE_BPS, fee_bps);
    d[OFF_NONCE..OFF_NONCE + 4].copy_from_slice(&nonce);
    write_u64(&mut d, OFF_MINT_PRICE, mint_price);
    write_key(&mut d, OFF_CREATOR, creator.address().as_array());
    write_key(&mut d, OFF_TREASURY, treasury.address().as_array());
    d[OFF_PROVENANCE..OFF_PROVENANCE + 32].copy_from_slice(&args[16..48]);
    d[OFF_GENERATOR..OFF_GENERATOR + 32].copy_from_slice(&args[48..80]);

    log!("init {}", max_supply);
    Ok(())
}

pub fn mint(program_id: &Address, accounts: &mut [AccountView], args: &[u8]) -> ProgramResult {
    let [minter, collection, creator, slot_hashes, _system, ..] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };
    args_len(args, 1)?;
    signer(minter)?;
    check_collection(program_id, collection)?;

    let count = args[0];
    if count == 0 || count > MAX_MINT_BATCH {
        return Err(Error::BadBatch.into());
    }

    let (minted, max_supply, mint_price) = {
        let d = collection.try_borrow()?;
        if key(&d, OFF_CREATOR) != creator.address().as_array() {
            return Err(Error::WrongCreator.into());
        }
        if d[OFF_FLAGS] & FLAG_CLOSED != 0 {
            return Err(Error::MintClosed.into());
        }
        (
            read_u16(&d, OFF_MINTED),
            read_u16(&d, OFF_MAX_SUPPLY),
            read_u64(&d, OFF_MINT_PRICE),
        )
    };
    let new_minted = minted
        .checked_add(count as u16)
        .filter(|m| *m <= max_supply)
        .ok_or(Error::SoldOut)?;
    let new_len = len_for(new_minted);

    let need = rent_min(new_len)?.saturating_sub(collection.lamports());
    if need > 0 {
        Transfer { from: minter, to: collection, lamports: need }.invoke()?;
    }
    let cost = mint_price
        .checked_mul(count as u64)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    if cost > 0 {
        Transfer { from: minter, to: creator, lamports: cost }.invoke()?;
    }

    let entropy = if new_minted == max_supply {
        Some(latest_slot_hash(slot_hashes)?)
    } else {
        None
    };

    collection.resize(new_len)?;
    let mut d = collection.try_borrow_mut()?;
    for id in minted..new_minted {
        write_key(&mut d, slot_off(id), minter.address().as_array());
    }
    write_u16(&mut d, OFF_MINTED, new_minted);
    if let Some(e) = entropy {
        d[OFF_ENTROPY..OFF_ENTROPY + 32].copy_from_slice(&e);
        d[OFF_FLAGS] |= FLAG_CLOSED;
    }

    log!("mint {} {}", minted, count);
    Ok(())
}

pub fn transfer(program_id: &Address, accounts: &mut [AccountView], args: &[u8]) -> ProgramResult {
    let [owner, collection, new_owner, ..] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };
    args_len(args, 2)?;
    signer(owner)?;
    check_collection(program_id, collection)?;
    if new_owner.address() == owner.address() {
        return Err(Error::SameOwner.into());
    }

    let id = read_u16(args, 0);
    let mut d = collection.try_borrow_mut()?;
    let o = slot(&d, id)?;
    if key(&d, o) != owner.address().as_array() {
        return Err(Error::NotOwner.into());
    }
    write_key(&mut d, o, new_owner.address().as_array());
    write_u32(&mut d, o + SLOT_PRICE, 0);

    log!("xfer {}", id);
    Ok(())
}

pub fn list(program_id: &Address, accounts: &mut [AccountView], args: &[u8]) -> ProgramResult {
    let [owner, collection, ..] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };
    args_len(args, 6)?;
    signer(owner)?;
    check_collection(program_id, collection)?;

    let id = read_u16(args, 0);
    let price = read_u32(args, 2);
    let mut d = collection.try_borrow_mut()?;
    let o = slot(&d, id)?;
    if key(&d, o) != owner.address().as_array() {
        return Err(Error::NotOwner.into());
    }
    write_u32(&mut d, o + SLOT_PRICE, price);

    log!("list {} {}", id, price);
    Ok(())
}

pub fn buy(program_id: &Address, accounts: &mut [AccountView], args: &[u8]) -> ProgramResult {
    let [buyer, collection, seller, treasury, _system, ..] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };
    args_len(args, 6)?;
    signer(buyer)?;
    check_collection(program_id, collection)?;
    if buyer.address() == seller.address() {
        return Err(Error::SelfBuy.into());
    }

    let id = read_u16(args, 0);
    let max_price = read_u32(args, 2);
    let (o, price, fee_bps) = {
        let d = collection.try_borrow()?;
        let o = slot(&d, id)?;
        if key(&d, o) != seller.address().as_array() {
            return Err(Error::SellerMismatch.into());
        }
        if key(&d, OFF_TREASURY) != treasury.address().as_array() {
            return Err(Error::WrongTreasury.into());
        }
        (o, read_u32(&d, o + SLOT_PRICE), read_u16(&d, OFF_FEE_BPS))
    };
    if price == 0 {
        return Err(Error::NotListed.into());
    }
    if price > max_price {
        return Err(Error::PriceAboveMax.into());
    }

    let lamports = price as u64 * PRICE_UNIT;
    let fee = lamports * fee_bps as u64 / BPS_DENOM;
    Transfer { from: buyer, to: seller, lamports: lamports - fee }.invoke()?;
    if fee > 0 {
        Transfer { from: buyer, to: treasury, lamports: fee }.invoke()?;
    }

    let mut d = collection.try_borrow_mut()?;
    write_key(&mut d, o, buyer.address().as_array());
    write_u32(&mut d, o + SLOT_PRICE, 0);

    log!("buy {} {}", id, price);
    Ok(())
}

pub fn reveal(program_id: &Address, accounts: &mut [AccountView], args: &[u8]) -> ProgramResult {
    let [creator, collection, slot_hashes, ..] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };
    args_len(args, 32)?;
    signer(creator)?;
    check_collection(program_id, collection)?;

    let closed = {
        let d = collection.try_borrow()?;
        if key(&d, OFF_CREATOR) != creator.address().as_array() {
            return Err(Error::WrongCreator.into());
        }
        if d[OFF_FLAGS] & FLAG_REVEALED != 0 {
            return Err(Error::AlreadyRevealed.into());
        }
        if sha256(&[args]) != d[OFF_PROVENANCE..OFF_PROVENANCE + 32] {
            return Err(Error::BadSecret.into());
        }
        d[OFF_FLAGS] & FLAG_CLOSED != 0
    };
    let entropy = if closed {
        None
    } else {
        Some(latest_slot_hash(slot_hashes)?)
    };

    let mut d = collection.try_borrow_mut()?;
    d[OFF_SECRET..OFF_SECRET + 32].copy_from_slice(args);
    d[OFF_FLAGS] |= FLAG_REVEALED;
    if let Some(e) = entropy {
        d[OFF_ENTROPY..OFF_ENTROPY + 32].copy_from_slice(&e);
        d[OFF_FLAGS] |= FLAG_CLOSED;
        let minted = read_u16(&d, OFF_MINTED);
        write_u16(&mut d, OFF_MAX_SUPPLY, minted);
    }

    log!("reveal");
    Ok(())
}

pub fn withdraw_excess(
    program_id: &Address,
    accounts: &mut [AccountView],
    args: &[u8],
) -> ProgramResult {
    let [creator, collection, ..] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };
    args_len(args, 0)?;
    signer(creator)?;
    check_collection(program_id, collection)?;
    {
        let d = collection.try_borrow()?;
        if key(&d, OFF_CREATOR) != creator.address().as_array() {
            return Err(Error::WrongCreator.into());
        }
    }

    let excess = collection
        .lamports()
        .saturating_sub(rent_min(collection.data_len())?);
    if excess > 0 {
        collection.set_lamports(collection.lamports() - excess);
        creator.set_lamports(creator.lamports() + excess);
    }

    log!("withdraw {}", excess);
    Ok(())
}
