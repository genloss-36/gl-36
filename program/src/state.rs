pub const TAG: u8 = 1;
pub const VERSION: u8 = 1;

pub const HEADER_LEN: usize = 224;
pub const SLOT_LEN: usize = 36;

pub const PRICE_UNIT: u64 = 1_000;
pub const MAX_MINT_BATCH: u8 = 10;
pub const MAX_FEE_BPS: u16 = 1_000;
pub const BPS_DENOM: u64 = 10_000;
pub const SETTLE_DELAY: u64 = 32;

pub const FLAG_SETTLED: u8 = 1 << 0;
pub const FLAG_CLOSED: u8 = 1 << 1;

pub const OFF_TAG: usize = 0;
pub const OFF_VERSION: usize = 1;
pub const OFF_BUMP: usize = 2;
pub const OFF_FLAGS: usize = 3;
pub const OFF_MAX_SUPPLY: usize = 4;
pub const OFF_MINTED: usize = 6;
pub const OFF_FEE_BPS: usize = 8;
pub const OFF_NONCE: usize = 12;
pub const OFF_MINT_PRICE: usize = 16;
pub const OFF_CREATOR: usize = 24;
pub const OFF_TREASURY: usize = 56;
pub const OFF_CLOSE_SLOT: usize = 88;
pub const OFF_ENTROPY: usize = 152;
pub const OFF_GENERATOR: usize = 184;

pub const SLOT_PRICE: usize = 32;

#[inline(always)]
pub fn read_u16(d: &[u8], off: usize) -> u16 {
    u16::from_le_bytes([d[off], d[off + 1]])
}

#[inline(always)]
pub fn write_u16(d: &mut [u8], off: usize, v: u16) {
    d[off..off + 2].copy_from_slice(&v.to_le_bytes());
}

#[inline(always)]
pub fn read_u32(d: &[u8], off: usize) -> u32 {
    u32::from_le_bytes([d[off], d[off + 1], d[off + 2], d[off + 3]])
}

#[inline(always)]
pub fn write_u32(d: &mut [u8], off: usize, v: u32) {
    d[off..off + 4].copy_from_slice(&v.to_le_bytes());
}

#[inline(always)]
pub fn read_u64(d: &[u8], off: usize) -> u64 {
    let mut b = [0u8; 8];
    b.copy_from_slice(&d[off..off + 8]);
    u64::from_le_bytes(b)
}

#[inline(always)]
pub fn write_u64(d: &mut [u8], off: usize, v: u64) {
    d[off..off + 8].copy_from_slice(&v.to_le_bytes());
}

#[inline(always)]
pub fn key(d: &[u8], off: usize) -> &[u8] {
    &d[off..off + 32]
}

#[inline(always)]
pub fn write_key(d: &mut [u8], off: usize, k: &[u8; 32]) {
    d[off..off + 32].copy_from_slice(k);
}

#[inline(always)]
pub fn slot_off(id: u16) -> usize {
    HEADER_LEN + id as usize * SLOT_LEN
}

#[inline(always)]
pub fn len_for(minted: u16) -> usize {
    HEADER_LEN + minted as usize * SLOT_LEN
}
