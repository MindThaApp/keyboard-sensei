using System;
using System.IO;
using System.Text.Json;

namespace MusicPortal;

/// <summary>
/// Build-time settings written next to the web build by scripts/build-web.ps1
/// (web/host-config.json). The API URL is the one baked into the web bundle; the
/// host only uses it to allow navigations to that origin.
/// </summary>
public static class AppConfig
{
    public static string? ApiUrl { get; } = Load();

    private static string? Load()
    {
        try
        {
            var path = Path.Combine(AppContext.BaseDirectory, "web", "host-config.json");
            if (!File.Exists(path)) return null;
            using var document = JsonDocument.Parse(File.ReadAllText(path));
            return document.RootElement.TryGetProperty("apiUrl", out var value) ? value.GetString() : null;
        }
        catch (Exception)
        {
            return null;
        }
    }
}
