using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace VerlofBWZC.DataContracts.DTO
{
    public class PersonBaseDTO
    {
        public int Id { get; set; }
        public string FirstName { get; set; }
        public string LastName { get; set; }
        public string Email { get; set; }   
        public string Team { get; set; }
        public string Speciality { get; set; }
        public string Grade{ get; set; }
        public string Role { get; set; }
        public int? LeaveAllowance { get; set; } // verlofshiften per jaar
        public string? Initials { get; set; } // leeg = standaardregel op de achternaam
        public bool MustChangePassword { get; set; } // tijdelijk wachtwoord, nog niet gewijzigd (enkel lezen)
        public bool IsApproved { get; set; } = true; // zelf geregistreerd en nog niet goedgekeurd = false (enkel lezen)
        public DateTime? RegisteredAtUtc { get; set; }

    }
}
