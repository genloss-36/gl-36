use pinocchio::error::ProgramError;

#[repr(u32)]
#[derive(Clone, Copy)]
pub enum Error {
    SoldOut = 1,
    BadBatch = 2,
    NotOwner = 3,
    NotListed = 4,
    PriceAboveMax = 5,
    SellerMismatch = 6,
    SelfBuy = 7,
    BadSecret = 8,
    AlreadyRevealed = 9,
    MintClosed = 10,
    BadFee = 11,
    BadSupply = 12,
    WrongCreator = 13,
    WrongTreasury = 14,
    BadId = 15,
    SameOwner = 16,
    BadSysvar = 17,
}

impl From<Error> for ProgramError {
    #[inline(always)]
    fn from(e: Error) -> Self {
        ProgramError::Custom(e as u32)
    }
}
