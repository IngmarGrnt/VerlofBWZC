using System.ComponentModel.DataAnnotations;
using VerlofBWZC.DataAccess.Enums;

namespace VerlofBWZC.DataAccess.Entities
{
    // Extra ploeg/specialiteit die een Manager beheert (bovenop zijn eigen ploeg en specialiteit).
    // Speciality null = alle specialiteiten van die ploeg.
    public class ManagerScope
    {
        [Key] public int Id { get; set; }
        public int PersonId { get; set; }
        public Person? Person { get; set; }
        public TeamName Team { get; set; }
        public Speciality? Speciality { get; set; }
    }
}
