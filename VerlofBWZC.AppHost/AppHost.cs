var builder = DistributedApplication.CreateBuilder(args);

// Combell-databank. De waarde staat in de user-secrets van deze AppHost
// (ConnectionStrings:DefaultConnection), niet in de repo.
var db = builder.AddConnectionString("DefaultConnection");

// De projecten targeten net9.0; roll-forward laat ze ook op een nieuwere runtime draaien.
var api = builder.AddProject<Projects.VerlofBWZC_Api>("api", launchProfileName: "https")
    .WithReference(db)
    .WithEnvironment("DOTNET_ROLL_FORWARD", "Major");

// Blazor WASM leest de API-URL uit wwwroot/appsettings.Development.json (https://localhost:7080),
// daarom blijven de vaste poorten uit de launch profiles behouden.
builder.AddProject<Projects.VerlofBWZC>("web", launchProfileName: "https")
    .WithEnvironment("DOTNET_ROLL_FORWARD", "Major")
    .WaitFor(api);

builder.Build().Run();
