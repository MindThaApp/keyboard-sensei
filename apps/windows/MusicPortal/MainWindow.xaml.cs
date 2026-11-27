using System;
using System.IO;
using System.Threading.Tasks;
using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;
using Microsoft.Web.WebView2.Core;
using Windows.ApplicationModel;

namespace MusicPortal;

public sealed partial class MainWindow : Window
{
    private WebHost? host;

    public MainWindow()
    {
        InitializeComponent();
        Title = "Music Portal";
        AppWindow.SetIcon(Path.Combine(AppContext.BaseDirectory, "Assets", "AppIcon.ico"));
        Closed += (_, _) => host?.Dispose();
        _ = StartAsync();
    }

    private async Task StartAsync()
    {
        string? runtime = null;
        try
        {
            runtime = CoreWebView2Environment.GetAvailableBrowserVersionString();
        }
        catch (Exception)
        {
            // WebView2NotFoundException and friends: handled below.
        }
        if (string.IsNullOrEmpty(runtime))
        {
            WebView.Visibility = Visibility.Collapsed;
            RuntimeMissingPanel.Visibility = Visibility.Visible;
            return;
        }

        await WebView.EnsureCoreWebView2Async();
        var core = WebView.CoreWebView2;
        // The page's fullscreen button (and F11 inside the page) fills the screen.
        core.ContainsFullScreenElementChanged += (_, _) =>
            AppWindow.SetPresenter(core.ContainsFullScreenElement ? AppWindowPresenterKind.FullScreen : AppWindowPresenterKind.Default);

        var webRoot = Path.Combine(AppContext.BaseDirectory, "web");
        host = new WebHost(core, webRoot, AppConfig.ApiUrl, DispatcherQueue, PackageVersion());
        await host.StartAsync();
    }

    private static string PackageVersion()
    {
        try
        {
            var v = Package.Current.Id.Version;
            return $"{v.Major}.{v.Minor}.{v.Build}.{v.Revision}";
        }
        catch (InvalidOperationException)
        {
            return "0.0.0.0"; // running unpackaged
        }
    }
}
