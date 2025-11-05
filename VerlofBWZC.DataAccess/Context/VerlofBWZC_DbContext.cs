using Microsoft.EntityFrameworkCore;
using VerlofBWZC.DataAccess.Entities;
using VerlofBWZC.DataAccess.Extensions;

public class VerlofBWZC_DbContext : DbContext
{
    public VerlofBWZC_DbContext():base(){}
    public VerlofBWZC_DbContext(DbContextOptions<VerlofBWZC_DbContext> options) : base(options){}

    public DbSet<DayOff> DayOffs { get; set; }
    public DbSet<Person> Persons { get; set; }
    public DbSet<CalendarAccessRule> CalendarAccessRules { get; set; }  

    public DbSet<LotteryDraw> LotteryDraws => Set<LotteryDraw>();
    public DbSet<LotteryWinner> LotteryWinners => Set<LotteryWinner>();
    public DbSet<LotteryLoser> LotteryLosers => Set<LotteryLoser>();

    protected override void OnConfiguring(DbContextOptionsBuilder optionsBuilder)
    {
       if(!optionsBuilder.IsConfigured)
            optionsBuilder.UseSqlServer("Server=mssql035.db.hosting;Database=ID458290_bwzc413;User Id=ID458290_bwzc413;Password=LilyLove250917;");
        
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.PersonConfig();
        modelBuilder.DayOffConfig();
        modelBuilder.LotteryDrawConfig();
        modelBuilder.CalendarAccessRuleConfig();
        //base.OnModelCreating(modelBuilder);
    }
}   