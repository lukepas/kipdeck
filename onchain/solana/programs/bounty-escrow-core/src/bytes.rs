//! Little-endian reading and writing of fixed layouts, without borsh: every account, instruction
//! and event is a flat run of fields, so the TypeScript SDK can read them with a DataView.

use crate::{EscrowError, Key};

/// Reads fields off the front of a byte slice.
pub struct Reader<'a> {
    data: &'a [u8],
    at: usize,
}

impl<'a> Reader<'a> {
    pub fn new(data: &'a [u8]) -> Self {
        Self { data, at: 0 }
    }

    fn take(&mut self, n: usize) -> Result<&'a [u8], EscrowError> {
        let end = self.at.checked_add(n).ok_or(EscrowError::InvalidData)?;
        let out = self.data.get(self.at..end).ok_or(EscrowError::InvalidData)?;
        self.at = end;
        Ok(out)
    }

    pub fn u8(&mut self) -> Result<u8, EscrowError> {
        Ok(self.take(1)?[0])
    }

    pub fn u16(&mut self) -> Result<u16, EscrowError> {
        let mut b = [0u8; 2];
        b.copy_from_slice(self.take(2)?);
        Ok(u16::from_le_bytes(b))
    }

    pub fn u64(&mut self) -> Result<u64, EscrowError> {
        let mut b = [0u8; 8];
        b.copy_from_slice(self.take(8)?);
        Ok(u64::from_le_bytes(b))
    }

    pub fn i64(&mut self) -> Result<i64, EscrowError> {
        Ok(self.u64()? as i64)
    }

    pub fn key(&mut self) -> Result<Key, EscrowError> {
        let mut k = [0u8; 32];
        k.copy_from_slice(self.take(32)?);
        Ok(k)
    }

    /// A borsh-style `Option<Key>` kept at a fixed size: a flag byte, then 32 bytes (zero when none).
    pub fn opt_key(&mut self) -> Result<Option<Key>, EscrowError> {
        let flag = self.u8()?;
        let k = self.key()?;
        match flag {
            0 if k == [0; 32] => Ok(None),
            1 => Ok(Some(k)),
            _ => Err(EscrowError::InvalidData),
        }
    }

    /// A borsh-style `Option<u64>` kept at a fixed size: a flag byte, then 8 bytes.
    pub fn opt_u64(&mut self) -> Result<Option<u64>, EscrowError> {
        let flag = self.u8()?;
        let v = self.u64()?;
        match flag {
            0 if v == 0 => Ok(None),
            1 => Ok(Some(v)),
            _ => Err(EscrowError::InvalidData),
        }
    }

    pub fn bytes20(&mut self) -> Result<[u8; 20], EscrowError> {
        let mut k = [0u8; 20];
        k.copy_from_slice(self.take(20)?);
        Ok(k)
    }

    /// Everything was read: trailing bytes mean the layout isn't the one expected.
    pub fn finish(self) -> Result<(), EscrowError> {
        if self.at == self.data.len() {
            Ok(())
        } else {
            Err(EscrowError::InvalidData)
        }
    }
}

/// Writes fields into a fixed-size buffer, front to back.
pub struct Writer<'a> {
    data: &'a mut [u8],
    at: usize,
}

impl<'a> Writer<'a> {
    pub fn new(data: &'a mut [u8]) -> Self {
        Self { data, at: 0 }
    }

    pub fn put(&mut self, bytes: &[u8]) -> Result<(), EscrowError> {
        let end = self.at.checked_add(bytes.len()).ok_or(EscrowError::InvalidData)?;
        self.data.get_mut(self.at..end).ok_or(EscrowError::InvalidData)?.copy_from_slice(bytes);
        self.at = end;
        Ok(())
    }

    pub fn u8(&mut self, v: u8) -> Result<(), EscrowError> {
        self.put(&[v])
    }

    pub fn u16(&mut self, v: u16) -> Result<(), EscrowError> {
        self.put(&v.to_le_bytes())
    }

    pub fn u64(&mut self, v: u64) -> Result<(), EscrowError> {
        self.put(&v.to_le_bytes())
    }

    pub fn i64(&mut self, v: i64) -> Result<(), EscrowError> {
        self.put(&v.to_le_bytes())
    }

    pub fn opt_key(&mut self, v: &Option<Key>) -> Result<(), EscrowError> {
        match v {
            Some(k) => self.u8(1).and(self.put(k)),
            None => self.u8(0).and(self.put(&[0; 32])),
        }
    }

    pub fn opt_u64(&mut self, v: Option<u64>) -> Result<(), EscrowError> {
        match v {
            Some(n) => self.u8(1).and(self.u64(n)),
            None => self.u8(0).and(self.u64(0)),
        }
    }

    /// How many bytes were written.
    pub fn len(&self) -> usize {
        self.at
    }

    pub fn is_empty(&self) -> bool {
        self.at == 0
    }
}
