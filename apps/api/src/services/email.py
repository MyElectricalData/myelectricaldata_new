import httpx
from ..config import settings
import logging



logger = logging.getLogger(__name__)

class EmailService:
    """Service for sending emails via Mailgun"""

    def __init__(self):
        self.api_key = settings.MAILGUN_API_KEY
        self.domain = settings.MAILGUN_DOMAIN
        self.from_email = settings.MAILGUN_FROM_EMAIL
        self.base_url = f"{settings.MAILGUN_API_BASE_URL}/{self.domain}"

    async def send_email(
        self,
        to_email: str,
        subject: str,
        html_content: str,
        text_content: str | None = None,
    ) -> bool:
        """Send an email via Mailgun"""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.base_url}/messages",
                    auth=("api", self.api_key),
                    data={
                        "from": self.from_email,
                        "to": to_email,
                        "subject": subject,
                        "html": html_content,
                        "text": text_content or "",
                    },
                )
                response.raise_for_status()
                return True
        except Exception as e:
            logger.error(f"[EMAIL] Failed to send email to {to_email}: {str(e)}")
            return False

    async def send_verification_email(self, to_email: str, verification_url: str) -> bool:
        """Send email verification email"""
        subject = "Vérifiez votre adresse email - MyElectricalData"

        html_content = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
        <h1 style="color: white; margin: 0;">MyElectricalData</h1>
    </div>

    <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
        <h2 style="color: #333; margin-top: 0;">Bienvenue !</h2>

        <p>Merci de vous être inscrit sur MyElectricalData.</p>

        <p>Pour activer votre compte et accéder à vos données Linky, veuillez vérifier votre adresse email en cliquant sur le bouton ci-dessous :</p>

        <div style="text-align: center; margin: 30px 0;">
            <a href="{verification_url}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
                Vérifier mon email
            </a>
        </div>

        <p style="color: #666; font-size: 14px;">Si le bouton ne fonctionne pas, copiez et collez ce lien dans votre navigateur :</p>
        <p style="word-break: break-all; color: #667eea; font-size: 12px;">{verification_url}</p>

        <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">

        <p style="color: #999; font-size: 12px; text-align: center;">
            Ce lien est valide pendant 24 heures.<br>
            Si vous n'avez pas créé de compte, ignorez cet email.
        </p>
    </div>
</body>
</html>
        """

        text_content = f"""
Bienvenue sur MyElectricalData !

Merci de vous être inscrit. Pour activer votre compte, veuillez vérifier votre adresse email en cliquant sur ce lien :

{verification_url}

Ce lien est valide pendant 24 heures.

Si vous n'avez pas créé de compte, ignorez cet email.

---
MyElectricalData
        """

        return await self.send_email(to_email, subject, html_content, text_content)

    async def send_password_reset_email(self, to_email: str, reset_url: str) -> bool:
        """Send password reset email"""
        subject = "Réinitialisation de votre mot de passe - MyElectricalData"

        html_content = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
        <h1 style="color: white; margin: 0;">MyElectricalData</h1>
    </div>

    <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
        <h2 style="color: #333; margin-top: 0;">Réinitialisation de mot de passe</h2>

        <p>Vous avez demandé à réinitialiser votre mot de passe.</p>

        <p>Pour créer un nouveau mot de passe, cliquez sur le bouton ci-dessous :</p>

        <div style="text-align: center; margin: 30px 0;">
            <a href="{reset_url}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
                Réinitialiser mon mot de passe
            </a>
        </div>

        <p style="color: #666; font-size: 14px;">Si le bouton ne fonctionne pas, copiez et collez ce lien dans votre navigateur :</p>
        <p style="word-break: break-all; color: #667eea; font-size: 12px;">{reset_url}</p>

        <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">

        <p style="color: #999; font-size: 12px; text-align: center;">
            Ce lien est valide pendant 1 heure.<br>
            Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.<br>
            Votre mot de passe restera inchangé.
        </p>
    </div>
</body>
</html>
        """

        text_content = f"""
Réinitialisation de mot de passe - MyElectricalData

Vous avez demandé à réinitialiser votre mot de passe.

Pour créer un nouveau mot de passe, cliquez sur ce lien :

{reset_url}

Ce lien est valide pendant 1 heure.

Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.
Votre mot de passe restera inchangé.

---
MyElectricalData
        """

        return await self.send_email(to_email, subject, html_content, text_content)


email_service = EmailService()
