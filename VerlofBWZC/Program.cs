using Microsoft.AspNetCore.Components.Web;
using Microsoft.AspNetCore.Components.WebAssembly.Hosting;
using Radzen;
using VerlofBWZC;
using VerlofBWZC.Services;
using Microsoft.AspNetCore.Components.Authorization;

var builder = WebAssemblyHostBuilder.CreateDefault(args);
builder.RootComponents.Add<App>("#app");
builder.RootComponents.Add<HeadOutlet>("head::after");

// appsettings.json en appsettings.{Environment}.json worden al geladen door CreateDefault;
// zo wordt appsettings.Development.json enkel lokaal gebruikt en niet in productie.

// AuthZ
builder.Services.AddAuthorizationCore();

// Auth state provider
builder.Services.AddScoped<JwtAuthenticationStateProvider>();
builder.Services.AddScoped<AuthenticationStateProvider>(sp => sp.GetRequiredService<JwtAuthenticationStateProvider>());


// HTTP handler die Bearer token meestuurt + 401/403 afvangt
builder.Services.AddScoped<AuthMessageHandler>();


// Haal het base address uit de configuratie
var apiBaseAddress = builder.Configuration["ApiBaseAddress"];

builder.Services.AddScoped(sp =>
{
    var handler = sp.GetRequiredService<AuthMessageHandler>();
    handler.InnerHandler = new HttpClientHandler();
    return new HttpClient(handler)
    {
        BaseAddress = new Uri(apiBaseAddress)
    };
});

// PersonServices
builder.Services.AddScoped<PersonApiService>();
builder.Services.AddScoped<IClientCleanupService, ClientCleanupService>();
builder.Services.AddScoped<DemoModeService>();
builder.Services.AddScoped<CurrentPersonService>();
builder.Services.AddScoped<LotteryApiService>();
builder.Services.AddScoped<ScopeService>();
builder.Services.AddScoped<AppInstallService>();



// Radzen components
builder.Services.AddRadzenComponents();

await builder.Build().RunAsync();
