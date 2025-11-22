using Microsoft.AspNetCore.Components.Web;
using Microsoft.AspNetCore.Components.WebAssembly.Hosting;
using Radzen;
using VerlofBWZC;
using VerlofBWZC.Services;
using Microsoft.AspNetCore.Components.Authorization;

var builder = WebAssemblyHostBuilder.CreateDefault(args);
builder.RootComponents.Add<App>("#app");
builder.RootComponents.Add<HeadOutlet>("head::after");

// Laad extra configuratie
builder.Configuration.AddJsonFile("appsettings.json", optional: false, reloadOnChange: false)
                     .AddJsonFile("appsettings.Development.json", optional: true, reloadOnChange: false);

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



// Radzen components
builder.Services.AddRadzenComponents();

await builder.Build().RunAsync();
