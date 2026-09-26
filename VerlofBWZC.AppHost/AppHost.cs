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

builder.Build().Run();
