using Microsoft.EntityFrameworkCore;
using VerlofBWZC.DataAccess.Entities;
using VerlofBWZC.DataAccess.Extensions;

public class VerlofBWZC_DbContext : DbContext
{
    public VerlofBWZC_DbContext():base(){}
    public VerlofBWZC_DbContext(DbContextOptions<VerlofBWZC_DbContext> options) : base(options){}

    public DbSet<DayOff> DayOffs { get; set; }
    public DbSet<Person> Persons { get; set; }

    protected override void OnConfiguring(DbContextOptionsBuilder optionsBuilder)
    {
       
            optionsBuilder.UseSqlServer("Data Source=.\\SQLEXPRESS;Initial Catalog=VerlofBWZC;Integrated Security=True; Trusted_Connection=True; TrustServerCertificate=True;");
        
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.PersonConfig();
        modelBuilder.DayOffConfig();
        //base.OnModelCreating(modelBuilder);
    }
}   