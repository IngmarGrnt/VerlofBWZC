using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Builder;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using System;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using VerlofBWZC.Api.Extensions;
using VerlofBWZC.Api.Helpers;
using VerlofBWZC.DataAccess.Entities;

//JwtSecurityTokenHandler.DefaultInboundClaimTypeMap.Clear();
//JwtSecurityTokenHandler.DefaultOutboundClaimTypeMap.Clear();

var builder = WebApplication.CreateBuilder(args);
var config = builder.Configuration;

// Get allowed origins from configuration based on environment
var environment = builder.Environment.EnvironmentName;
var originsSection = config.GetSection($"AllowOrigins:{environment}");
var allowedOrigins = originsSection.Get<string[]>();


// Add services to the container.
builder.Services.AddControllers();
builder.Services.AddOpenApi();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddAutoMapperConfiguration();
builder.Services.AddDbContext<VerlofBWZC_DbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection")));

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
builder.Services.AddHttpClient();
builder.Services.AddScoped<CalendarHelper>();

var app = builder.Build();

// Log de environment en DB-connection en voer migraties uit (optioneel)
using (var scope = app.Services.CreateScope())
{
    var env = scope.ServiceProvider.GetRequiredService<IWebHostEnvironment>();
    var db = scope.ServiceProvider.GetRequiredService<VerlofBWZC_DbContext>();
    var cs = db.Database.GetDbConnection().ConnectionString;
    app.Logger.LogInformation("Environment: {env}", env.EnvironmentName);
    app.Logger.LogInformation("EF Core gebruikt database: {cs}", cs);
    // db.Database.Migrate(); // uncomment als je bij start automatisch wil migreren
}

app.UseCors();
// Configure Swagger middleware
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}
app.UseCors();
app.UseHttpsRedirection();

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

app.Run();
