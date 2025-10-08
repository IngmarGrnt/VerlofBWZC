using System;
using VerlofBWZC.DataAccess.Enums;


namespace VerlofBWZC.DataAccess.Entities
{
    public class Team:BaseEntity
    {
        public TeamName Name { get; set; }

        public DateTime StartDate => Name switch
        {
            TeamName.Ploeg0 => new DateTime(2010, 1, 1, 0, 0, 0),
            TeamName.Ploeg1 => new DateTime(2010, 1, 4, 0, 0, 0),
            TeamName.Ploeg2 => new DateTime(2010, 1, 1, 0, 0, 0),
            TeamName.Ploeg3 => new DateTime(2010, 1, 2, 0, 0, 0),
            TeamName.Ploeg4 => new DateTime(2010, 1, 3, 0, 0, 0),
            _ => throw new ArgumentOutOfRangeException()
        };
    }
}
