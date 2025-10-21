using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace VerlofBWZC.DataContracts.DTO
{
   
    public class PersonCreateDTO
    {
        
        public string FirstName { get; set; }
        public string LastName { get; set; }
        public string Email { get; set; }
        public string Team { get; set; }
        public string Speciality { get; set; }
        public string Grade { get; set; }
        public string Role { get; set; }
        public string? Password { get; set; }
        public string PasswordHash { get; set; } = string.Empty;
        public string Salt { get; set; }= string.Empty;

    }
}