#![no_std]

use pinocchio::{
    error::ProgramError, no_allocator, nostd_panic_handler, program_entrypoint, AccountView,
    Address, ProgramResult,
};

mod error;
mod ix;
mod state;
mod util;

program_entrypoint!(process_instruction);
no_allocator!();
nostd_panic_handler!();

pub fn process_instruction(
    program_id: &Address,
    accounts: &mut [AccountView],
    data: &[u8],
) -> ProgramResult {
    let (tag, args) = data
        .split_first()
        .ok_or(ProgramError::InvalidInstructionData)?;
    match tag {
        0 => ix::init(program_id, accounts, args),
        1 => ix::mint(program_id, accounts, args),
        2 => ix::transfer(program_id, accounts, args),
        3 => ix::list(program_id, accounts, args),
        4 => ix::buy(program_id, accounts, args),
        5 => ix::reveal(program_id, accounts, args),
        6 => ix::withdraw_excess(program_id, accounts, args),
        _ => Err(ProgramError::InvalidInstructionData),
    }
}
