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
    }
}
