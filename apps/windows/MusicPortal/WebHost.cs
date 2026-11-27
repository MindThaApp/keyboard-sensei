using System;
using System.Diagnostics;
using System.IO;
using System.Threading.Tasks;
using Microsoft.UI.Dispatching;
using Microsoft.Web.WebView2.Core;
using MusicPortal.Midi;
using Windows.System;

namespace MusicPortal;

/// <summary>
/// Binds the WebView2 to the packaged web build (spec 8.2): the virtual host
/// origin, permissions (microphone and MIDI for the app's own pages only),
/// navigation lock-down, the host marker script and the MIDI bridge messages.
/// </summary>
public sealed class WebHost : IDisposable
{
    private readonly CoreWebView2 core;
    private readonly string webRoot;
    private readonly HostPolicy policy;
    private readonly DispatcherQueue dispatcher;
    private readonly string version;
    private MidiBridge? midi;

    public WebHost(CoreWebView2 core, string webRoot, string? apiUrl, DispatcherQueue dispatcher, string version)
    {
        this.core = core;
        this.webRoot = webRoot;
        this.dispatcher = dispatcher;
        this.version = version;
        policy = new HostPolicy(apiUrl);
    }

    public async Task StartAsync()
    {
        midi = TryCreateMidiBridge();

        core.SetVirtualHostNameToFolderMapping(HostPolicy.HostName, webRoot, CoreWebView2HostResourceAccessKind.DenyCors);
        core.AddWebResourceRequestedFilter($"{HostPolicy.AppOrigin}*", CoreWebView2WebResourceContext.Document);
        core.WebResourceRequested += OnWebResourceRequested;

        var settings = core.Settings;
        settings.IsWebMessageEnabled = true;
        settings.IsStatusBarEnabled = false;
        settings.IsGeneralAutofillEnabled = false;
        settings.IsPasswordAutosaveEnabled = false;
#if DEBUG
        settings.AreDevToolsEnabled = true;
#else
        settings.AreDevToolsEnabled = false;
#endif

        await core.AddScriptToExecuteOnDocumentCreatedAsync(HostPolicy.HostScript(version, midi is not null));
        core.PermissionRequested += OnPermissionRequested;
        core.NavigationStarting += OnNavigationStarting;
        core.NewWindowRequested += OnNewWindowRequested;
        core.WebMessageReceived += OnWebMessageReceived;

        core.Navigate(HostPolicy.AppOrigin.ToString());
    }

    private MidiBridge? TryCreateMidiBridge()
    {
        try
        {
            return new MidiBridge(json => dispatcher.TryEnqueue(() => core.PostWebMessageAsJson(json)));
        }
        catch (Exception error)
        {
            // The page falls back to Web MIDI inside WebView2.
            Trace.WriteLine($"Native MIDI unavailable: {error.Message}");
            return null;
        }
    }

    /// <summary>Serves index.html for client-side routes so a reload on any screen works.</summary>
    private void OnWebResourceRequested(object? sender, CoreWebView2WebResourceRequestedEventArgs args)
    {
        if (!Uri.TryCreate(args.Request.Uri, UriKind.Absolute, out var uri)) return;
        var file = HostPolicy.ResolveFile(webRoot, uri, File.Exists);
        if (file is null || !file.EndsWith("index.html", StringComparison.OrdinalIgnoreCase)) return;
        var stream = File.OpenRead(file);
        args.Response = core.Environment.CreateWebResourceResponse(
            stream.AsRandomAccessStream(), 200, "OK", "Content-Type: text/html; charset=utf-8");
    }

    private void OnPermissionRequested(object? sender, CoreWebView2PermissionRequestedEventArgs args)
    {
        var allowed = HostPolicy.Grants(args.PermissionKind.ToString(), args.Uri);
        args.State = allowed ? CoreWebView2PermissionState.Allow : CoreWebView2PermissionState.Deny;
        args.Handled = true;
    }

    private void OnNavigationStarting(object? sender, CoreWebView2NavigationStartingEventArgs args)
    {
        if (policy.MayNavigate(args.Uri)) return;
        args.Cancel = true;
        OpenExternally(args.Uri);
    }

    private void OnNewWindowRequested(object? sender, CoreWebView2NewWindowRequestedEventArgs args)
    {
        args.Handled = true;
        if (HostPolicy.IsAppOrigin(args.Uri)) core.Navigate(args.Uri);
        else OpenExternally(args.Uri);
    }

    private static void OpenExternally(string uri)
    {
        if (HostPolicy.MayOpenExternally(uri)) _ = Launcher.LaunchUriAsync(new Uri(uri));
    }

    private async void OnWebMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs args)
    {
        // Only the app's own pages may drive the host.
        if (!HostPolicy.IsAppOrigin(args.Source)) return;
        string json;
        try
        {
            json = args.WebMessageAsJson;
        }
        catch (ArgumentException)
        {
            return;
        }
        switch (BridgeProtocol.Parse(json))
        {
            case OpenSettingsRequest settings:
                _ = Launcher.LaunchUriAsync(new Uri(BridgeProtocol.SettingsPages[settings.Page]));
                break;
            case BridgeRequest request:
                core.PostWebMessageAsJson(await HandleAsync(request));
                break;
        }
    }

    private async Task<string> HandleAsync(BridgeRequest request)
    {
        try
        {
            switch (request.Method)
            {
                case "midi.isAvailable":
                    return BridgeProtocol.Ok(request.Id, BridgeProtocol.Available(midi is not null));
                case "clock.now":
                    return BridgeProtocol.Ok(request.Id, BridgeProtocol.Clock(midi?.NowMs ?? 0));
            }
            if (midi is null) return BridgeProtocol.Error(request.Id, "Native MIDI is not available on this PC.");
            switch (request.Method)
            {
                case "midi.start":
                    return BridgeProtocol.Ok(request.Id, BridgeProtocol.Devices(await midi.StartAsync()));
                case "midi.list":
                    return BridgeProtocol.Ok(request.Id, BridgeProtocol.Devices(midi.Devices));
                case "midi.stop":
                    midi.Stop();
                    return BridgeProtocol.Ok(request.Id, null);
                default:
                    return BridgeProtocol.Error(request.Id, $"Unknown method {request.Method}");
            }
        }
        catch (Exception error)
        {
            return BridgeProtocol.Error(request.Id, error.Message);
        }
    }

    public void Dispose() => midi?.Dispose();
}
