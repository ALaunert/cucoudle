# Homebrew install for the Cucoudle desktop client

The public repo doubles as a Homebrew tap: the formula lives at
[`HomebrewFormula/cucoudle.rb`](../../HomebrewFormula/cucoudle.rb). Any user can
install with:

```bash
brew tap alaunert/cucoudle https://github.com/ALaunert/cucoudle
brew trust alaunert/cucoudle   # Homebrew 6 requires trusting third-party taps once
brew install cucoudle
cucoudle install               # shims + PATH integration for your shell
brew services start cucoudle   # run the daemon in the background (autostart)
```

`brew install` gives the global `cucoudle` command (no alias, no venv). The
formula builds an isolated virtualenv and `pip install`s the `apps/desktop`
package (pydantic/websockets/qrcode come as PyPI wheels — no Rust/compiler), then
links `cucoudle` onto PATH. A `service` block integrates with `brew services`.
The relay is a hosted service (`relay.launert.dev`) and is never installed here.

Bleeding edge (build from `main`): `brew install --HEAD cucoudle`.

## Cutting a new release

1. Tag and push:
   ```bash
   git tag v0.1.1 && git push origin v0.1.1
   ```
2. Get the tarball sha256 and update `HomebrewFormula/cucoudle.rb` (`url` + `sha256`):
   ```bash
   curl -Ls https://github.com/ALaunert/cucoudle/archive/refs/tags/v0.1.1.tar.gz | shasum -a 256
   ```
3. Commit the formula. Users get it on their next `brew update`.

## Optional: prettier tap command

To let users run `brew tap ALaunert/cucoudle` (without the URL), create a public
repo `ALaunert/homebrew-cucoudle` and copy `HomebrewFormula/cucoudle.rb` into its
`Formula/` directory. Then:

```bash
brew tap ALaunert/cucoudle
brew trust ALaunert/cucoudle
brew install cucoudle
```

## License

The formula declares `license "MIT"`. Add a top-level `LICENSE` file (MIT) to the
repo so this is accurate before wide distribution.
