
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using VerlofBWZC.DataAccess.Entities;



namespace VerlofBWZC.Api.Helpers

{
    public static class JwtTokenHelper
    {
        public static string GenerateJwtToken(Person person, IConfiguration config)
        {
            var claims = new List<Claim>
                    {
                        new Claim(JwtRegisteredClaimNames.Sub, person.Id.ToString()),
                        new Claim(JwtRegisteredClaimNames.Name, $"{person.FirstName} {person.LastName}"),
                        new Claim(JwtRegisteredClaimNames.Email, person.Email),
                        new Claim(ClaimTypes.Role, person.Role?.ToString() ?? string.Empty),
                    };

            var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(config["Jwt:Key"]));
            var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);


            var token = new JwtSecurityToken(
                issuer: config["Jwt:Issuer"],
                audience: config["Jwt:Audience"],
                claims: claims,
                expires: DateTime.UtcNow.AddHours(1),
                signingCredentials: creds
            );
 

            return new JwtSecurityTokenHandler().WriteToken(token);
        }
    }
}
