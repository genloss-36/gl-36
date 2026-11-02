use pinocchio::{
    error::ProgramError,
    sysvars::{clock::Clock, rent::Rent, Sysvar},
    AccountView, Address, ProgramResult,
};

use crate::{error::Error, state::*};

pub const SLOT_HASHES_ID: Address = Address::new_from_array([
    6, 167, 213, 23, 25, 47, 10, 175, 198, 242, 101, 227, 251, 119, 204, 122, 218, 130, 197, 41,
    208, 190, 59, 19, 110, 45, 0, 85, 32, 0, 0, 0,
]);

#[inline(always)]
pub fn signer(a: &AccountView) -> ProgramResult {
    if a.is_signer() {
        Ok(())
    } else {
        Err(ProgramError::MissingRequiredSignature)
    }
}

pub fn check_collection(program_id: &Address, a: &AccountView) -> ProgramResult {
    if !a.owned_by(program_id) {
        return Err(ProgramError::InvalidAccountOwner);
    }
    if !a.is_writable() {
        return Err(ProgramError::Immutable);
    }
    let d = a.try_borrow()?;
    if d.len() < HEADER_LEN
        || d[OFF_TAG] != TAG
        || d[OFF_VERSION] != VERSION
        || d.len() != len_for(read_u16(&d, OFF_MINTED))
    {
        return Err(ProgramError::InvalidAccountData);
    }
    Ok(())
}

#[inline(always)]
pub fn slot(d: &[u8], id: u16) -> Result<usize, ProgramError> {
    if id < read_u16(d, OFF_MINTED) {
        Ok(slot_off(id))
    } else {
        Err(Error::BadId.into())
    }
}

#[inline(always)]
pub fn rent_min(len: usize) -> Result<u64, ProgramError> {
    Rent::get()?.try_minimum_balance(len)
}

#[inline(always)]
pub fn current_slot() -> Result<u64, ProgramError> {
    Ok(Clock::get()?.slot)
}

pub enum SlotHash {
    Found([u8; 32]),
    NotYet,
    Gone,
}

const SLOT_HASHES_CAP: usize = 512;
const SLOT_HASH_ENTRY: usize = 40;

pub fn slot_hash_from(sysvar: &AccountView, target: u64) -> Result<SlotHash, ProgramError> {
    if sysvar.address() != &SLOT_HASHES_ID {
        return Err(Error::BadSysvar.into());
    }
    let d = sysvar.try_borrow()?;
    if d.len() < 8 {
        return Err(Error::BadSysvar.into());
    }
    let n = read_u64(&d, 0) as usize;
    if d.len() < 8 + n * SLOT_HASH_ENTRY {
        return Err(Error::BadSysvar.into());
    }
    let mut found = None;
    let mut bounded = false;
    for i in 0..n {
        let off = 8 + i * SLOT_HASH_ENTRY;
        if read_u64(&d, off) >= target {
            found = Some(off + 8);
        } else {
            bounded = true;
            break;
        }
    }
    Ok(match found {
        None => SlotHash::NotYet,
        Some(_) if !bounded && n >= SLOT_HASHES_CAP => SlotHash::Gone,
        Some(off) => {
            let mut h = [0u8; 32];
            h.copy_from_slice(&d[off..off + 32]);
            SlotHash::Found(h)
        }
    })
}
