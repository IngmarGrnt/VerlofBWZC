using Microsoft.AspNetCore.Components.Web;
using Microsoft.AspNetCore.Components.WebAssembly.Hosting;
using Radzen;
using VerlofBWZC;

var builder = WebAssemblyHostBuilder.CreateDefault(args);
builder.RootComponents.Add<App>("#app");
builder.RootComponents.Add<HeadOutlet>("head::after");

builder.Services.AddScoped<AuthMessageHandler>();
builder.Services.AddScoped(sp =>
{
    var handler = sp.GetRequiredService<AuthMessageHandler>();
    handler.InnerHandler = new HttpClientHandler();
    return new HttpClient(handler)
    {
        BaseAddress = new Uri("https://localhost:7080/") // <-- Zet hier het adres van je API
    };
});
builder.Services.AddRadzenComponents();
// builder.Services.AddOidcAuthentication(options =>
// {
//     builder.Configuration.Bind("Local", options.ProviderOptions);
// });

await builder.Build().RunAsync();
