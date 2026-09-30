using Microsoft.EntityFrameworkCore;
using System;
using System.Reflection.Emit;
using VerlofBWZC.DataAccess.Entities;

namespace VerlofBWZC.DataAccess.Extensions
{
    public static class ExtensionMethods
    {
        public static void PersonConfig(this ModelBuilder mb)
        {
            mb.Entity<Person>()
                .HasMany(p => p.DayOffs)
                .WithOne()
                .HasForeignKey(d => d.PersonId)
                .OnDelete(DeleteBehavior.Cascade);

            mb.Entity<Person>()
                .Property(p => p.FirstName)
                .IsRequired()
                .HasMaxLength(50);

            mb.Entity<Person>()
                .Property(p => p.LastName)
                .IsRequired()
                .HasMaxLength(50);


            mb.Entity<Person>()
                .HasIndex(p => p.Email)
                .IsUnique();

            // Optioneel: beperkingen voor PasswordHash en Salt
            mb.Entity<Person>()
                .Property(p => p.PasswordHash)
                .IsRequired()
                .HasMaxLength(256);
            mb.Entity<Person>()
                .Property(p => p.Salt)
                .IsRequired()
                .HasMaxLength(128);
        }

        public static void DayOffConfig(this ModelBuilder mb)
        {
            mb.Entity<DayOff>()
                .Property(d => d.Date)
                .IsRequired();

            mb.Entity<DayOff>()
                .Property(d => d.Description)
                .IsRequired()
                .HasMaxLength(200);

            mb.Entity<DayOff>()
                .Property(d => d.Status)
                .IsRequired();

            mb.Entity<DayOff>()
                .Property(d => d.Shift)
                .HasMaxLength(50);
        }

        public static void LotteryDrawConfig(this ModelBuilder mb)
        {
            mb.Entity<LotteryDraw>()
                .HasMany(d => d.Winners)
                .WithOne(w => w.LotteryDraw!)
                .HasForeignKey(w => w.LotteryDrawId)
                .OnDelete(DeleteBehavior.Cascade);

            mb.Entity<LotteryDraw>()
                .HasMany(d => d.Losers)
                .WithOne(l => l.LotteryDraw!)
                .HasForeignKey(l => l.LotteryDrawId)
                .OnDelete(DeleteBehavior.Cascade);

            mb.Entity<LotteryDraw>()
                .HasIndex(d => d.DrawNumber);

        }

        public static void CalendarAccessRuleConfig(this ModelBuilder mb)
        {
            mb.Entity<CalendarAccessRule>()
                .Property(c => c.Team)
                .IsRequired();

            mb.Entity<CalendarAccessRule>()
                .Property(c => c.Speciality)
                .IsRequired();

            mb.Entity<CalendarAccessRule>()
                .Property(c => c.Year);
        }

        public static void LeaveCategoryConfig(this ModelBuilder mb)
        {
            mb.Entity<LeaveCategory>()
                .Property(c => c.Name)
                .IsRequired()
                .HasMaxLength(50);

            mb.Entity<LeaveCategory>()
                .Property(c => c.Color)
                .IsRequired()
                .HasMaxLength(9);

            mb.Entity<LeaveCategory>()
                .HasIndex(c => new { c.Team, c.Speciality, c.Year });

            // Categorie verwijderen maakt de verlofdagen weer "gewoon verlof"
            mb.Entity<DayOff>()
                .HasOne<LeaveCategory>()
                .WithMany()
                .HasForeignKey(d => d.LeaveCategoryId)
                .OnDelete(DeleteBehavior.SetNull);
        }

        public static void QuarterLimitConfig(this ModelBuilder mb)
        {
            mb.Entity<QuarterLimit>()
                .HasIndex(q => new { q.Team, q.Speciality, q.Year });
        }

        public static void ManagerScopeConfig(this ModelBuilder mb)
        {
            // Persoon verwijderen verwijdert ook zijn beheerde ploegen
            mb.Entity<ManagerScope>()
                .HasOne(s => s.Person)
                .WithMany()
                .HasForeignKey(s => s.PersonId)
                .OnDelete(DeleteBehavior.Cascade);

            mb.Entity<ManagerScope>()
                .HasIndex(s => new { s.PersonId, s.Team, s.Speciality })
                .IsUnique()
                .HasFilter(null); // ook 'alle specialiteiten' (null) maar één keer per ploeg
        }

        public static void ShiftQuotaConfig(this ModelBuilder mb)
        {
            // Eén regel per ploeg, specialiteit en jaar (ook maar één standaardregel zonder jaar)
            mb.Entity<ShiftQuota>()
                .HasIndex(q => new { q.Team, q.Speciality, q.Year })
                .IsUnique()
                .HasFilter(null);
        }

        public static void ExtraShiftConfig(this ModelBuilder mb)
        {
            // Persoon weg = zijn extra shiften ook weg
            mb.Entity<ExtraShift>()
                .HasOne<Person>()
                .WithMany()
                .HasForeignKey(e => e.PersonId)
                .OnDelete(DeleteBehavior.Cascade);

            mb.Entity<ExtraShift>()
                .Property(e => e.Shift)
                .IsRequired()
                .HasMaxLength(1);

            mb.Entity<ExtraShift>()
                .Property(e => e.Note)
                .HasMaxLength(200);

            // Eén extra shift per persoon, datum en shift
            mb.Entity<ExtraShift>()
                .HasIndex(e => new { e.PersonId, e.Date, e.Shift })
                .IsUnique();

            mb.Entity<ExtraShift>()
                .HasIndex(e => new { e.Team, e.Date });
        }

        public static void RestShiftConfig(this ModelBuilder mb)
        {
            // Persoon weg = zijn rustshiften ook weg
            mb.Entity<RestShift>()
                .HasOne<Person>()
                .WithMany()
                .HasForeignKey(r => r.PersonId)
                .OnDelete(DeleteBehavior.Cascade);

            mb.Entity<RestShift>()
                .Property(r => r.Shift)
                .IsRequired()
                .HasMaxLength(1);

            mb.Entity<RestShift>()
                .Property(r => r.Code)
                .HasMaxLength(4);

            // Eén keer rust per persoon, datum en shift
            mb.Entity<RestShift>()
                .HasIndex(r => new { r.PersonId, r.Date, r.Shift })
                .IsUnique();
        }

        public static void RefreshTokenConfig(this ModelBuilder mb)
        {
            // Persoon weg = zijn vernieuwingstokens ook weg
            mb.Entity<RefreshToken>()
                .HasOne<Person>()
                .WithMany()
                .HasForeignKey(r => r.PersonId)
                .OnDelete(DeleteBehavior.Cascade);

            mb.Entity<RefreshToken>()
                .Property(r => r.TokenHash)
                .IsRequired()
                .HasMaxLength(64);

            mb.Entity<RefreshToken>()
                .HasIndex(r => r.TokenHash)
                .IsUnique();
        }
    }
}



