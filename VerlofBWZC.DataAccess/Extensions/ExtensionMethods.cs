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
        }
    }
}
