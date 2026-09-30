var builder = DistributedApplication.CreateBuilder(args);

// Databank en JWT-signing key. De waarden staan in de user-secrets van deze AppHost
// (ConnectionStrings:DefaultConnection en Parameters:jwt-key), niet in de repo.
var db = builder.AddConnectionString("DefaultConnection");
var jwtKey = builder.AddParameter("jwt-key", secret: true);

var api = builder.AddProject<Projects.VerlofBWZC_Api>("api", launchProfileName: "https")
    .WithReference(db)
    .WithEnvironment("Jwt__Key", jwtKey);

// Blazor WASM leest de API-URL uit wwwroot/appsettings.Development.json (https://localhost:7080),
// daarom blijven de vaste poorten uit de launch profiles behouden.
builder.AddProject<Projects.VerlofBWZC>("web", launchProfileName: "https")
    .WaitFor(api);

// React-kopie van de Blazor-app (VerlofBWZC.React). Start pas als je in het dashboard op Start klikt.
// Vite stuurt /api door naar de API (API_TARGET); npm install gebeurt automatisch.
builder.AddViteApp("react", "../VerlofBWZC.React")
    .WithNpm()
    .WithEnvironment("API_TARGET", api.GetEndpoint("https"))
    .WaitFor(api)
    .WithExplicitStart();

builder.Build().Run();
