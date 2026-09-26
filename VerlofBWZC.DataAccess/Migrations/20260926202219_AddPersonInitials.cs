using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace VerlofBWZC.DataAccess.Migrations
{
    /// <inheritdoc />
    public partial class AddPersonInitials : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Initials",
                table: "Persons",
                type: "nvarchar(10)",
                maxLength: 10,
                nullable: true);

            // Bestaande personen: initialen volgens de vroegere vaste regel op de achternaam
            // (samengestelde naam: 2 letters van het eerste deel + 1 van het tweede, anders de eerste 3 letters)
            // In EXEC: in een idempotent script staat dit in dezelfde batch als de ALTER TABLE
            migrationBuilder.Sql(@"
EXEC(N'UPDATE Persons SET Initials = UPPER(
    CASE WHEN CHARINDEX('' '', LTRIM(RTRIM(LastName))) > 0
         THEN LEFT(LEFT(LTRIM(RTRIM(LastName)), CHARINDEX('' '', LTRIM(RTRIM(LastName))) - 1), 2)
              + LEFT(LTRIM(SUBSTRING(LTRIM(RTRIM(LastName)), CHARINDEX('' '', LTRIM(RTRIM(LastName))) + 1, 200)), 1)
         ELSE LEFT(LTRIM(RTRIM(LastName)), 3)
    END)
WHERE Initials IS NULL AND LastName IS NOT NULL AND LTRIM(RTRIM(LastName)) <> ''''');");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Initials",
                table: "Persons");
        }
    }
}
