# Test fixture

`android-discovery.js` is a test-only copy of
`Fileport-Android-v2.7/app/src/main/assets/discovery.js`.

The GitHub Actions Windows job checks out *only* this Windows repository.
Do not make tests depend on source paths outside this repository.
When the paired Android discovery protocol changes, update this fixture and
re-run `npm test` to verify the request signatures and trust behavior.
