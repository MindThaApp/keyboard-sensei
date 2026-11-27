# Music Portal for Windows

The Windows app (`apps/windows`) is a small WinUI 3 window with one WebView2 that
serves the production build of `apps/web` from inside the MSIX package, the same
way the Android app ships the web build in its APK. Design and reasoning: spec
section 8 (`docs/specs/MUSIC-PORTAL.md`).

```
apps/windows/
  MusicPortal.sln
  MusicPortal/                  WinUI 3 app (Windows App SDK, .NET 8), single-project MSIX
    App.xaml(.cs), MainWindow.xaml(.cs)   one WebView2, full screen, missing-runtime screen
    WebHost.cs                  virtual host, permissions, navigation lock-down, bridge messages
    HostPolicy.cs               the rules WebHost applies (pure, unit-tested)
    Midi/MidiBridge.cs          device watcher, ports, message forwarding (Windows.Devices.Midi)
    Midi/MidiMessageParser.cs   port of the Android parser (same test cases)
    Midi/BridgeProtocol.cs      JSON protocol with packages/midi-engine/src/windows.ts
    Package.appxmanifest        identity placeholders, capabilities
    web/                        copy of apps/web/dist (build output, not committed)
  MusicPortal.Tests/            xUnit: parser, bridge protocol, host policy, timestamps
  scripts/build-web.ps1         builds apps/web for the app and copies dist
  scripts/package-store.ps1     x64 + arm64 MSIX, bundle, .msixupload
  scripts/rasterize-assets.mjs  tile/store logos, splash and AppIcon.ico from the brand SVG
  Identity.props.example        copy to Identity.props (git-ignored) for local builds
```

## How it works

- **Origin.** The web build is mapped to `https://app.musicportal.invalid`
  (`SetVirtualHostNameToFolderMapping`). That origin is **fixed forever**: local
  storage and IndexedDB (settings, the offline lesson cache and the attempt
  outbox) are keyed by it. Client-side routes (`/learn`, `/lessons/...`) are
  answered with `index.html`, so a reload works on every screen.
- **API.** The bundle is built with an absolute `VITE_API_URL`. Add
  `https://app.musicportal.invalid` to the API's `CORS_ORIGIN` list (comma
  separated), as `https://localhost` is for Android.
- **Navigation lock-down.** Only the app origin and the API origin load in the
  window. Other `http(s)`/`mailto` links open in the default browser; anything
  else is dropped.
- **Permissions.** The host grants the microphone and MIDI (incl. SysEx) only to
  pages from the app origin, and denies everything else (camera, location, ...).
  The first `getUserMedia` also shows Windows' own microphone consent prompt. If
  Windows privacy settings block the microphone, the page can call
  `openWindowsSettings("privacy-microphone")` (`apps/web/src/native/windowsHost.ts`),
  which opens Settings → Privacy & security → Microphone.
- **Host marker.** Before any page script runs, the host defines
  `window.__musicPortalHost = { platform: "windows", version, midiBridge, protocol }`.
  `hostPlatform()` in `apps/web/src/native/platform.ts` returns `"windows"`.
- **MIDI.** When the native bridge starts, `midiBridge` is true and
  `createHardwareMidiAdapter()` returns a `WindowsMidiAdapter`
  (`packages/midi-engine/src/windows.ts`): USB keyboards, Bluetooth LE MIDI
  keyboards once paired in Windows Settings → Bluetooth & devices, and hot-plug
  (unplug/replug resumes input without a reload). Native timestamps go through
  the same `NativeClockSync` as Android. Otherwise the page uses Web MIDI inside
  WebView2 (USB only, no BLE). Where Windows MIDI Services is installed it backs
  the same API and ports become multi-client; on the classic stack a keyboard
  held by another app (a DAW) is listed as "(in use by another app)".
- **Offline.** The UI is in the package, so the app always starts. Lessons
  opened or downloaded while online, and attempts made offline, work as on the
  web (spec 8.5; `apps/web/src/offline/`). The tuner and piano check need no
  network.
- **Sign-in.** Email sign-in works. Google sign-in inside an embedded web view
  is blocked by Google and is not offered as a fix here.

## Package identity (never committed)

`Package.appxmanifest` holds placeholders. The real values come from Partner
Center (Product identity) and are injected at build time by the
`MusicPortalIdentityManifest` target in `MusicPortal.csproj`:

| MSBuild property | CI secret or variable | Placeholder default |
|---|---|---|
| `MusicPortalIdentityName` | `MUSICPORTAL_IDENTITY_NAME` | `MusicPortal.LocalBuild` |
| `MusicPortalPublisher` | `MUSICPORTAL_PUBLISHER` | `CN=MusicPortalLocalBuild` |
| `MusicPortalPublisherDisplayName` | `MUSICPORTAL_PUBLISHER_DISPLAY_NAME` | `Music Portal (local build)` |
| `MusicPortalVersion` | (from the CI run number: `1.0.<run>.0`) | `1.0.0.0` |

In GitHub: Settings → Secrets and variables → Actions. Secrets win over
variables of the same name. Without any of them CI still builds, with the
placeholders. Also set the variable `MUSICPORTAL_API_URL` to the public API URL
the Windows bundle should use.

Locally, copy `apps/windows/Identity.props.example` to `apps/windows/Identity.props`
(git-ignored) and edit it.

## Capabilities

`internetClient` (API) and `microphone` (mic grading, tuner, piano check), plus
`runFullTrust`, which every packaged WinUI 3 desktop app declares (the Store asks
for a one-line justification: "packaged desktop app built with the Windows App
SDK"). MIDI, including paired Bluetooth LE MIDI, needs no capability.

## Build locally (Windows 10/11)

1. Visual Studio 2022 with *.NET desktop development* and *Windows application
   development* (Windows App SDK), .NET 8 SDK, Git, Node.js 22, pnpm 10.12.1
   (`corepack enable && corepack prepare pnpm@10.12.1 --activate`).
2. Settings → System → For developers → **Developer Mode** on.
3. `pnpm install` at the repo root.
4. `pwsh apps/windows/scripts/build-web.ps1 -ApiUrl https://<api domain>`
5. Copy `Identity.props.example` to `Identity.props`.
6. Debug: open `apps/windows/MusicPortal.sln`, pick x64, F5. Or
   `dotnet build apps/windows/MusicPortal -c Debug -p:Platform=x64`.
7. Package for sideloading: `msbuild apps/windows/MusicPortal/MusicPortal.csproj /restore
   /p:Configuration=Release /p:Platform=x64 /p:GenerateAppxPackageOnBuild=true
   /p:AppxPackageSigningEnabled=true /p:PackageCertificateKeyFile=<your test .pfx>`
   (a self-signed test certificate whose subject matches `MusicPortalPublisher`;
   never commit it), trust the certificate, then `Add-AppxPackage`.
8. Store package: `pwsh apps/windows/scripts/package-store.ps1 -Version 1.0.N.0`
   builds x64 and arm64, bundles them (`makeappx bundle`) and writes
   `out/MusicPortal_<version>.msixupload` (unsigned; the Store signs it).
9. Run the Windows App Certification Kit on the package.
10. `dotnet test apps/windows/MusicPortal.Tests` (these also run on Linux and macOS).

Icons: `node apps/windows/scripts/rasterize-assets.mjs` re-renders `Assets/` from
`brand/music-portal-icon.svg` (or the current icon until that exists).

## CI

`.github/workflows/windows.yml` runs on `windows-latest` for changes under
`apps/windows`, `apps/web` and `packages`: midi-engine tests, the web bundle,
the host unit tests, then one unsigned **x64 + arm64 `.msixupload`**, uploaded
as the `music-portal-windows-msixupload` artifact (kept 14 days). Upload that
file in Partner Center; the Store signs it.

## Manual test matrix (every release)

USB keyboard plugged in before launch / after launch / unplugged mid-exercise
and during play-along; BLE MIDI keyboard paired and reconnected after sleep;
keyboard held by another app; mic allowed / denied / revoked in Settings while
running; offline launch, offline lesson, reconnect and outbox replay; x64 and
arm64; Windows 10 and Windows 11; 100% and 150% display scaling; touch screen.
