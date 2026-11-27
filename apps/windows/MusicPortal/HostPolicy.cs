using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;

namespace MusicPortal;

/// <summary>
/// What the WebView may load, open and use. Pure (no WebView2 types) so it is unit-tested;
/// WebHost applies it.
/// </summary>
public sealed class HostPolicy
{
    /// <summary>
    /// The page origin, fixed forever: local storage and IndexedDB (settings, the
    /// offline outbox) are keyed by it. `.invalid` can never resolve on a network.
    /// </summary>
    public const string HostName = "app.musicportal.invalid";
    public static readonly Uri AppOrigin = new($"https://{HostName}/");

    private static readonly HashSet<string> GrantedPermissions = new(StringComparer.Ordinal)
    {
        // CoreWebView2PermissionKind names. Web MIDI without SysEx surfaces as
        // UnknownPermission on some runtimes; it is granted only to the app origin.
        "Microphone", "MidiSystemExclusiveMessages", "Autoplay", "UnknownPermission",
    };

    private readonly Uri? apiOrigin;

    public HostPolicy(string? apiUrl)
    {
        if (Uri.TryCreate(apiUrl, UriKind.Absolute, out var api) && (api.Scheme == Uri.UriSchemeHttps || api.Scheme == Uri.UriSchemeHttp))
            apiOrigin = new Uri(api.GetLeftPart(UriPartial.Authority) + "/");
    }

    public static bool IsAppOrigin(Uri? uri) =>
        uri is not null && uri.Scheme == Uri.UriSchemeHttps && uri.IsDefaultPort &&
        string.Equals(uri.Host, HostName, StringComparison.OrdinalIgnoreCase);

    public static bool IsAppOrigin(string? uri) => Uri.TryCreate(uri, UriKind.Absolute, out var parsed) && IsAppOrigin(parsed);

    /// <summary>Navigations allowed inside the app window: the app itself and the API origin.</summary>
    public bool MayNavigate(string uri)
    {
        if (uri == "about:blank") return true;
        if (!Uri.TryCreate(uri, UriKind.Absolute, out var parsed)) return false;
        if (IsAppOrigin(parsed)) return true;
        return apiOrigin is not null && parsed.GetLeftPart(UriPartial.Authority) + "/" == apiOrigin.ToString();
    }

    /// <summary>Links that leave the app open in the default browser (or mail app); anything else is dropped.</summary>
    public static bool MayOpenExternally(string uri) =>
        Uri.TryCreate(uri, UriKind.Absolute, out var parsed) &&
        (parsed.Scheme == Uri.UriSchemeHttps || parsed.Scheme == Uri.UriSchemeHttp || parsed.Scheme == Uri.UriSchemeMailto) &&
        !IsAppOrigin(parsed);

    /// <summary>Permission requests: only the app's own pages get the microphone and MIDI.</summary>
    public static bool Grants(string permissionKind, string? requestingUri) =>
        GrantedPermissions.Contains(permissionKind) && IsAppOrigin(requestingUri);

    /// <summary>
    /// The file a request to the app origin maps to under <paramref name="webRoot"/>.
    /// Client-side routes (/learn, /lessons/x) have no file and get index.html, so
    /// a reload on any screen works. Paths that escape the root are refused (null).
    /// </summary>
    public static string? ResolveFile(string webRoot, Uri uri, Func<string, bool> fileExists)
    {
        if (!IsAppOrigin(uri)) return null;
        var root = Path.GetFullPath(webRoot);
        var relative = Uri.UnescapeDataString(uri.AbsolutePath).TrimStart('/');
        var candidate = Path.GetFullPath(Path.Combine(root, relative.Replace('/', Path.DirectorySeparatorChar)));
        var rootWithSeparator = root.EndsWith(Path.DirectorySeparatorChar) ? root : root + Path.DirectorySeparatorChar;
        if (!candidate.StartsWith(rootWithSeparator, StringComparison.OrdinalIgnoreCase) && candidate != root) return null;
        if (relative.Length > 0 && fileExists(candidate)) return candidate;
        // A missing asset (has an extension) is a real 404; a route is the app.
        if (Path.HasExtension(relative)) return null;
        return Path.Combine(root, "index.html");
    }

    /// <summary>The script that announces the host to the page before any page script runs.</summary>
    public static string HostScript(string version, bool midiBridge) =>
        "Object.defineProperty(window, \"__musicPortalHost\", { value: Object.freeze(" +
        JsonSerializer.Serialize(new Dictionary<string, object>
        {
            ["platform"] = "windows",
            ["version"] = version,
            ["midiBridge"] = midiBridge,
            ["protocol"] = Midi.BridgeProtocol.Version,
        }) +
        "), configurable: false, writable: false });";
}
