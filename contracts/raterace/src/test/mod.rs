//! Unit tests. One file per owner so we don't collide:
//!   registry_tests.rs (Pranav), orders_tests.rs (Abhiraj), settle_tests.rs (Avani).
//! Shared setup lives in helpers.rs.
extern crate std;

pub mod helpers;

mod orders_tests;
mod registry_tests;
mod settle_tests;
