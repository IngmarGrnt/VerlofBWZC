using System;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.IdentityModel.Tokens;
using System.Text;
using Microsoft.Extensions.Configuration;
using VerlofBWZC.DataAccess.Entities;
using System.Collections.Generic;
using System.Diagnostics;

namespace VerlofBWZC.DataContracts.Helpers
{
    public static class JwtTokenHelper
    {
        public static string GenerateJwtToken(Person person, IConfiguration config)
        {
            var claims = new List<Claim>
            {
                new Claim(ClaimTypes.NameIdentifier, person.Id.ToString()),
                new Claim(ClaimTypes.Name, $"{person.FirstName} {person.LastName}"),
                new Claim(ClaimTypes.Email, person.Email),
                new Claim(ClaimTypes.Role, person.Role?.ToString() ?? string.Empty)
            };

            if (person.Team != null)
                claims.Add(new Claim("Team", person.Team.ToString()));
            if (person.Speciality != null)
                claims.Add(new Claim("Speciality", person.Speciality.ToString()));
            if (person.Grade != null)
                claims.Add(new Claim("Grade", person.Grade.ToString()));

            Debug.WriteLine($"Team: {person.Team}, Speciality: {person.Speciality}, Grade: {person.Grade}");
            foreach (var claim in claims)
            {
                Debug.WriteLine($"Claim: {claim.Type} = {claim.Value}");
            }

            var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(config["Jwt:Key"]));
            var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

            var token = new JwtSecurityToken(
                issuer: config["Jwt:Issuer"],
                audience: config["Jwt:Audience"],
                claims: claims,
                expires: DateTime.Now.AddHours(1),
                signingCredentials: creds);

            return new JwtSecurityTokenHandler().WriteToken(token);
        }
    }
}
