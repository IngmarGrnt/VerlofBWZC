using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace VerlofBWZC.DataAccess.Entities
{
    public class LotteryDraw
    {
        [Key] public int Id { get; set; }
        public int DrawNumber { get; set; }
        [MaxLength(200)] public string DrawName { get; set; } = "";
        public DateTime FromDate { get; set; }
        public DateTime ToDate { get; set; }
        // Enkel deze shift ("D" of "N"); null = alle shiften in de periode (paar dag + nacht)
        [MaxLength(1)] public string? Shift { get; set; }
        public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

        public ICollection<LotteryWinner> Winners { get; set; } = new List<LotteryWinner>();
        public ICollection<LotteryLoser> Losers { get; set; } = new List<LotteryLoser>();
    }

    public class LotteryWinner
    {
        [Key] public int Id { get; set; }
        public int PersonId { get; set; }
        [MaxLength(200)] public string FirstName { get; set; } = "";
        [MaxLength(200)] public string LastName { get; set; } = "";

        public int LotteryDrawId { get; set; }
        public LotteryDraw? LotteryDraw { get; set; }
    }
    public class LotteryLoser
    {
        [Key] public int Id { get; set; }
        public int PersonId { get; set; }
        [MaxLength(200)] public string FirstName { get; set; } = "";
        [MaxLength(200)] public string LastName { get; set; } = "";

        // Bij toepassen weggehaald verlof (om terug te zetten als de loting verwijderd wordt)
        public bool RemovedDay { get; set; }
        public bool RemovedNight { get; set; }
        public int? DayLeaveCategoryId { get; set; }
        public int? NightLeaveCategoryId { get; set; }

        public int LotteryDrawId { get; set; }
        public LotteryDraw? LotteryDraw { get; set; }
    }
}


