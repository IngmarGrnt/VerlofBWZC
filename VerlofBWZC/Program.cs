using Microsoft.AspNetCore.Components.Web;
using Microsoft.AspNetCore.Components.WebAssembly.Hosting;
using Radzen;
using VerlofBWZC;
using VerlofBWZC.Services;


var builder = WebAssemblyHostBuilder.CreateDefault(args);
builder.RootComponents.Add<App>("#app");
builder.RootComponents.Add<HeadOutlet>("head::after");


// Laad extra configuratie
builder.Configuration.AddJsonFile("appsettings.json", optional: false, reloadOnChange: false)
                     .AddJsonFile("appsettings.Development.json", optional: true, reloadOnChange: false);

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

//PersonServices
builder.Services.AddScoped<PersonApiService>();

//Radzen components
builder.Services.AddRadzenComponents();

await builder.Build().RunAsync();
