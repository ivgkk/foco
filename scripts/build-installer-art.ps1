$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$assetsDir = Join-Path (Split-Path -Parent $PSScriptRoot) 'assets'
$purple = [System.Drawing.Color]::FromArgb(255, 170, 145, 255)
$lavender = [System.Drawing.Color]::FromArgb(255, 205, 190, 255)
$dark = [System.Drawing.Color]::FromArgb(255, 15, 16, 24)
$panel = [System.Drawing.Color]::FromArgb(255, 27, 25, 40)

function Save-FocoSidebar([string]$path) {
  $bitmap = [System.Drawing.Bitmap]::new(164, 314, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $background = [System.Drawing.Drawing2D.LinearGradientBrush]::new([System.Drawing.Rectangle]::new(0, 0, 164, 314), $panel, $dark, 90)
  $graphics.FillRectangle($background, 0, 0, 164, 314)
  $orb = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(40, $purple))
  $graphics.FillEllipse($orb, 75, -45, 145, 145)
  $markBrush = [System.Drawing.SolidBrush]::new($purple)
  $lavenderBrush = [System.Drawing.SolidBrush]::new($lavender)
  $markBack = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(48, 43, 67))
  $graphics.FillRoundedRectangle($markBack, [System.Drawing.Rectangle]::new(24, 34, 48, 48), 12)
  $fontMark = [System.Drawing.Font]::new('Segoe UI', 25, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $fontTitle = [System.Drawing.Font]::new('Segoe UI', 19, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $fontBody = [System.Drawing.Font]::new('Segoe UI', 10, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
  $fontTag = [System.Drawing.Font]::new('Segoe UI', 7, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $white = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(245, 243, 250))
  $muted = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(178, 174, 192))
  $graphics.DrawString('F', $fontMark, $white, 36, 36)
  $graphics.DrawString('FOCO', $fontTag, $lavenderBrush, 25, 101)
  $graphics.DrawString('Compartilhe', $fontTitle, $white, 23, 123)
  $graphics.DrawString('sua tela.', $fontTitle, $white, 23, 148)
  $graphics.DrawLine([System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(80, $purple), 1), 24, 190, 139, 190)
  $graphics.DrawString('Jogue junto. Assista', $fontBody, $muted, 24, 207)
  $graphics.DrawString('no seu ritmo.', $fontBody, $muted, 24, 224)
  $graphics.DrawString('SALAS DE TRANSMISSÃO', $fontTag, $markBrush, 24, 278)
  $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Bmp)
  $graphics.Dispose(); $background.Dispose(); $bitmap.Dispose(); $markBrush.Dispose(); $lavenderBrush.Dispose(); $white.Dispose(); $muted.Dispose()
}

# Add the rounded rectangle helper to GDI+ for the installer brand mark.
Update-TypeData -TypeName System.Drawing.Graphics -MemberName FillRoundedRectangle -MemberType ScriptMethod -Value {
  param($brush, $rect, $radius)
  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $diameter = $radius * 2
  $path.AddArc($rect.X, $rect.Y, $diameter, $diameter, 180, 90)
  $path.AddArc($rect.Right - $diameter, $rect.Y, $diameter, $diameter, 270, 90)
  $path.AddArc($rect.Right - $diameter, $rect.Bottom - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($rect.X, $rect.Bottom - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure(); $this.FillPath($brush, $path); $path.Dispose()
}

Save-FocoSidebar (Join-Path $assetsDir 'foco-installer-sidebar.bmp')

$header = [System.Drawing.Bitmap]::new(150, 57, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$g = [System.Drawing.Graphics]::FromImage($header)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$brush = [System.Drawing.Drawing2D.LinearGradientBrush]::new([System.Drawing.Rectangle]::new(0, 0, 150, 57), $dark, $panel, 0)
$g.FillRectangle($brush, 0, 0, 150, 57)
$titleFont = [System.Drawing.Font]::new('Segoe UI', 12, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$smallFont = [System.Drawing.Font]::new('Segoe UI', 7, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$whiteBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(245, 243, 250))
$mutedBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(170, 166, 184))
$g.DrawString('Foco', $titleFont, $whiteBrush, 12, 8)
$g.DrawString('INSTALAÇÃO', $smallFont, $mutedBrush, 13, 29)
$header.Save((Join-Path $assetsDir 'foco-installer-header.bmp'), [System.Drawing.Imaging.ImageFormat]::Bmp)
$g.Dispose(); $brush.Dispose(); $header.Dispose()

Write-Output 'Arte do instalador do Foco gerada em assets/.'
