using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using VerlofBWZC.DataAccess.Enums;

namespace VerlofBWZC.DataAccess.Entities
{
    public class Person:BaseEntity
    {

        public string FirstName { get; set; }
        public string LastName { get; set; }
        public string Email { get; set; }

        // Login-specific fields
        public string PasswordHash { get; set; }
        public string Salt { get; set; }


        // Enum-properties in plaats van foreign keys
        public TeamName? Team { get; set; }
        public Speciality? Speciality { get; set; }
        public Grade? Grade { get; set; }
        public Role? Role { get; set; }

        // Aantal verlofshiften per jaar (null = geen limiet ingesteld)
        public int? LeaveAllowance { get; set; }

        // Initialen in de teamkalender (standaard volgens de regel op de achternaam, aanpasbaar)
        [System.ComponentModel.DataAnnotations.MaxLength(10)]
        public string? Initials { get; set; }

        // Login-beveiliging: tijdelijk wachtwoord moet gewijzigd worden, blokkering na foute pogingen,
        // aantal PBKDF2-herhalingen van de huidige hash (oude hashes worden bij login omgezet)
        public bool MustChangePassword { get; set; }
        public int FailedLoginCount { get; set; }
        public DateTime? LockoutUntilUtc { get; set; }
        public int PasswordIterations { get; set; } = 100_000;


        // Many-to-many relationship
        public ICollection<DayOff> DayOffs { get; set; }
    }
}


