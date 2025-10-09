using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using VerlofBWZC.DataAccess.Entities;

namespace VerlofBWZC.DataContracts.Helpers
{
    public static class JwtTokenHelper
    {
        public static string GenerateJwtToken(Person person, IConfiguration config)
        {
            var claims = new List<Claim>
            {
                //new Claim(ClaimTypes.NameIdentifier, person.Id.ToString()),
                //new Claim(ClaimTypes.Name, $"{person.FirstName} {person.LastName}"),
                //new Claim(ClaimTypes.Email, person.Email),
                //new Claim(ClaimTypes.Role, person.Role?.ToString() ?? string.Empty),

                 new Claim("TestClaim", "TestWaarde")
            };

            if (person.Team != null)
                claims.Add(new Claim("Team", person.Team.ToString()));
            if (person.Speciality != null)
                claims.Add(new Claim("Speciality", person.Speciality.ToString()));
            if (person.Grade != null)
                claims.Add(new Claim("Grade", person.Grade.ToString()));



            var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(config["Jwt:Key"]));
            var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

            var token = new JwtSecurityToken(
                issuer: config["Jwt:Issuer"],
                audience: config["Jwt:Audience"],
                claims: claims, 
                expires: DateTime.Now.AddHours(1),
                signingCredentials: creds);

            //Console.WriteLine($"Team: {person.Team}, Speciality: {person.Speciality}, Grade: {person.Grade}");
            //foreach (var claim in claims)
            //{
            //    Console.WriteLine($"Claim: {claim.Type} = {claim.Value}");
            //}
            return new JwtSecurityTokenHandler().WriteToken(token);
        }
    }
}
