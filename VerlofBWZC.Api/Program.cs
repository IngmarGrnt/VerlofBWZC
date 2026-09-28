using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.RateLimiting;
using System.Threading.RateLimiting;

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

// Achter Azure App Service: het echte IP-adres van de bezoeker uit X-Forwarded-For (voor de loginlimiet)
builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    options.KnownIPNetworks.Clear();
    options.KnownProxies.Clear();
});

// Loginpogingen beperken per IP-adres (bovenop de blokkering per account na 5 foute pogingen)
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.OnRejected = async (context, token) =>
        await context.HttpContext.Response.WriteAsync("Te veel pogingen. Probeer het over een minuut opnieuw.", token);
    options.AddPolicy("login", context => RateLimitPartition.GetFixedWindowLimiter(
        context.Connection.RemoteIpAddress?.ToString() ?? "onbekend",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 10, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
    // Registreren: max. 5 aanvragen per 10 minuten per IP-adres
    options.AddPolicy("register", context => RateLimitPartition.GetFixedWindowLimiter(
        context.Connection.RemoteIpAddress?.ToString() ?? "onbekend",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 5, Window = TimeSpan.FromMinutes(10), QueueLimit = 0 }));
});

var app = builder.Build();

app.UseForwardedHeaders();





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

// Tijdelijk wachtwoord: met het beperkte token mag enkel het wachtwoord gewijzigd worden
app.Use(async (context, next) =>
{
    var mustChange = context.User.FindFirst(JwtTokenHelper.PasswordChangeClaim)?.Value == "true";
    if (mustChange && !context.Request.Path.StartsWithSegments("/api/person/change-password", StringComparison.OrdinalIgnoreCase))
    {
        context.Response.StatusCode = StatusCodes.Status403Forbidden;
        await context.Response.WriteAsync("Kies eerst een nieuw wachtwoord.");
        return;
    }
    await next();
});

app.UseRateLimiter();

app.UseAuthorization();

app.MapControllers();
app.MapDefaultEndpoints();

app.Run();
