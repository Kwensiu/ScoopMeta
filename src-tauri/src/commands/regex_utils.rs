//! Utility module for common regular expressions used throughout the application.
use once_cell::sync::Lazy;
use regex::Regex;

/// Regex to validate bucket names - lowercase alphanumeric with dashes or underscores
pub static BUCKET_NAME_REGEX: Lazy<Regex> = 
    Lazy::new(|| Regex::new(r"^[a-z0-9][a-z0-9-_]*$").unwrap());

/// Regex to extract repository name from URL
pub static URL_EXTRACT_REGEX: Lazy<Regex> = 
    Lazy::new(|| Regex::new(r"/([^/]+?)(?:\.git)?/?$").unwrap());