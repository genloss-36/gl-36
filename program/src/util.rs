use pinocchio::{
    error::ProgramError,
    sysvars::{rent::Rent, Sysvar},
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

pub fn sha256(parts: &[&[u8]]) -> [u8; 32] {
    let mut out = [0u8; 32];
    #[cfg(any(target_os = "solana", target_arch = "bpf"))]
    unsafe {
        pinocchio::syscalls::sol_sha256(
            parts.as_ptr() as *const u8,
            parts.len() as u64,
            out.as_mut_ptr(),
        );
    }
    #[cfg(not(any(target_os = "solana", target_arch = "bpf")))]
    let _ = parts;
    out
}

pub fn latest_slot_hash(sysvar: &AccountView) -> Result<[u8; 32], ProgramError> {
    if sysvar.address() != &SLOT_HASHES_ID {
        return Err(Error::BadSysvar.into());
    }
    let d = sysvar.try_borrow()?;
    if d.len() < 48 || read_u64(&d, 0) == 0 {
        return Err(Error::BadSysvar.into());
    }
    let mut h = [0u8; 32];
    h.copy_from_slice(&d[16..48]);
    Ok(h)
}
