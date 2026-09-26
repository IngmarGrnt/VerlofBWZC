using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace VerlofBWZC.DataAccess.Migrations
{
    /// <inheritdoc />
    public partial class AddPersonLoginSecurity : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "FailedLoginCount",
                table: "Persons",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<DateTime>(
                name: "LockoutUntilUtc",
                table: "Persons",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "MustChangePassword",
                table: "Persons",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<int>(
                name: "PasswordIterations",
                table: "Persons",
                type: "int",
                nullable: false,
                defaultValue: 100000); // bestaande hashes zijn gemaakt met 100.000 herhalingen
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "FailedLoginCount",
                table: "Persons");

            migrationBuilder.DropColumn(
                name: "LockoutUntilUtc",
                table: "Persons");

            migrationBuilder.DropColumn(
                name: "MustChangePassword",
                table: "Persons");

            migrationBuilder.DropColumn(
                name: "PasswordIterations",
                table: "Persons");
        }
    }
}
