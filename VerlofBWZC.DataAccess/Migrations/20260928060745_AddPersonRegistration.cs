using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace VerlofBWZC.DataAccess.Migrations
{
    /// <inheritdoc />
    public partial class AddPersonRegistration : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsApproved",
                table: "Persons",
                type: "bit",
                nullable: false,
                defaultValue: true); // bestaande personen blijven gewoon inloggen

            migrationBuilder.AddColumn<DateTime>(
                name: "RegisteredAtUtc",
                table: "Persons",
                type: "datetime2",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "IsApproved",
                table: "Persons");

            migrationBuilder.DropColumn(
                name: "RegisteredAtUtc",
                table: "Persons");
        }
    }
}
