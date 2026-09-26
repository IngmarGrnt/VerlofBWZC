using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;

using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using System.Text;
using VerlofBWZC.Api.Extensions;
using VerlofBWZC.Api.Helpers;
using VerlofBWZC.Api.Services;

//JwtSecurityTokenHandler.DefaultInboundClaimTypeMap.Clear();
//JwtSecurityTokenHandler.DefaultOutboundClaimTypeMap.Clear();

var builder = WebApplication.CreateBuilder(args);
var config = builder.Configuration;

builder.AddServiceDefaults();

// Get allowed origins from configuration based on environment
var environment = builder.Environment.EnvironmentName;
var originsSection = config.GetSection($"AllowOrigins:{environment}");
var allowedOrigins = originsSection.Get<string[]>();


// Add services to the container.
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddAutoMapperConfiguration();
builder.Services.AddDbContext<VerlofBWZC_DbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection")));
builder.Services.AddScoped<CalendarAccessService>();
builder.Services.AddScoped<LeaveCategoryService>();
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<UserContext>();


// Use allowed origins from configuration
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.WithOrigins(allowedOrigins ?? Array.Empty<string>())
              .AllowAnyHeader()
              .AllowAnyMethod();
    });
});

// Swagger + JWT Bearer auth in Swagger
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new OpenApiInfo { Title = "VerlofBWZC API", Version = "v1" });

    var securityScheme = new OpenApiSecurityScheme
    {
        Name = "Authorization",
        Description = "Bearer token invoeren. Voorbeeld: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
        In = ParameterLocation.Header,
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        Reference = new OpenApiReference
        {
            Type = ReferenceType.SecurityScheme,
            Id = "Bearer"
        }
    };

    options.AddSecurityDefinition("Bearer", securityScheme);
    options.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        { securityScheme, Array.Empty<string>() }
    });
});




builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = config["Jwt:Issuer"],
            ValidAudience = config["Jwt:Audience"],
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(config["Jwt:Key"]))
        };
    });
// Standaard login verplicht op elk endpoint; uitzonderingen expliciet met [AllowAnonymous]
builder.Services.AddAuthorization(options =>
{
    options.FallbackPolicy = new AuthorizationPolicyBuilder()
        .RequireAuthenticatedUser()
        .Build();
});
builder.Services.AddHttpClient();
builder.Services.AddScoped<CalendarHelper>();

var app = builder.Build();





// Log de environment en DB-connection en voer migraties uit (optioneel)
using (var scope = app.Services.CreateScope())
{
    var env = scope.ServiceProvider.GetRequiredService<IWebHostEnvironment>();
    var db = scope.ServiceProvider.GetRequiredService<VerlofBWZC_DbContext>();
    var conn = db.Database.GetDbConnection();
    app.Logger.LogInformation("Environment: {env}", env.EnvironmentName);
    // Enkel server en databanknaam loggen, nooit de volledige connection string (bevat wachtwoord)
    app.Logger.LogInformation("EF Core gebruikt database: {server}/{database}", conn.DataSource, conn.Database);
    // db.Database.Migrate(); // uncomment als je bij start automatisch wil migreren
}

app.UseCors();
//Configure Swagger middleware
if (app.Environment.IsDevelopment())
{
    app.UseDeveloperExceptionPage();
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();

app.UseCors();


app.UseAuthentication();

// Demo modus (admin bekijkt de app als andere rol/ploeg/specialiteit): enkel lezen, nooit opslaan
app.Use(async (context, next) =>
{
    var isDemo = context.User.FindFirst(UserContext.DemoClaim)?.Value == "true";
    var method = context.Request.Method;
    if (isDemo && !HttpMethods.IsGet(method) && !HttpMethods.IsHead(method) && !HttpMethods.IsOptions(method))
    {
        context.Response.StatusCode = StatusCodes.Status403Forbidden;
        await context.Response.WriteAsync("Demo modus: alleen bekijken, opslaan is niet mogelijk.");
        return;
    }
    await next();
});

app.UseAuthorization();

app.MapControllers();
app.MapDefaultEndpoints();

app.Run();
