# Test Update Channel

This document explains the test update channel feature in Rscoop, which allows users to receive test builds with the latest features before they are released to the stable channel.

## Overview

The test update channel is designed for users who want to try out the latest features and bug fixes before they are officially released. This channel receives builds that are created from the `test` branch of the repository whenever changes are pushed.

## How to Enable Test Updates

1. Open the Settings page in Rscoop
2. Navigate to the "Update" category
3. Select "Test" from the Update Channel dropdown
4. Restart the application for changes to take effect

## Important Notes

- Test builds may contain bugs or unfinished features
- Test builds are not as thoroughly tested as stable releases
- Test builds have a different versioning scheme (e.g., 1.4.652) to distinguish them from stable releases
- You can switch back to the stable channel at any time

## Automatic Updates

When the test update channel is enabled:
- The application will check for updates from the test endpoint instead of the stable release endpoint
- Test builds are automatically created and published when changes are pushed to the `test` branch
- The update notification will show that you're on the test channel

## Version Comparison

In version numbering, higher numbers indicate newer versions:
- 1.4.7 < 1.4.10 < 1.4.61
- Version numbers are compared as whole numbers, not character by character

## For Developers

The test update channel is particularly useful for:
- Testing new features before they're widely released
- Providing early feedback on changes
- Contributing to the development process

## Switching Back to Stable

To switch back to the stable channel:
1. Open Settings → Update
2. Select "Stable" from the Update Channel dropdown
3. Restart the application

## Troubleshooting

If you encounter issues with test builds:
1. Report the issue on the GitHub repository
2. Consider switching back to the stable channel
3. Check the release notes for known issues

## CI/CD Integration

The test update channel is integrated with CI/CD:
- Automatic builds are triggered when changes are pushed to the `test` branch
- Build artifacts are published as GitHub releases with the `test-` prefix
- A test update endpoint is maintained at `docs/test-update.json`
- Test builds are not signed and should only be used for testing purposes