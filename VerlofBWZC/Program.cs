using Microsoft.AspNetCore.Components.Web;
using Microsoft.AspNetCore.Components.WebAssembly.Hosting;
using Radzen;
using VerlofBWZC;
using VerlofBWZC.Services;


var builder = WebAssemblyHostBuilder.CreateDefault(args);
builder.RootComponents.Add<App>("#app");
builder.RootComponents.Add<HeadOutlet>("head::after");

builder.Services.AddScoped<AuthMessageHandler>();


//API_SERVICES met AuthMessageHandler
builder.Services.AddScoped(sp =>
{
    var handler = sp.GetRequiredService<AuthMessageHandler>();
    handler.InnerHandler = new HttpClientHandler();
    return new HttpClient(handler)
    {
        //BaseAddress = new Uri("https://localhost:7080/")
        BaseAddress = new Uri("https://api.gidco.be")
    };
});

//PersonServices
builder.Services.AddScoped<PersonApiService>();



//Radzen components
builder.Services.AddRadzenComponents();


await builder.Build().RunAsync();
