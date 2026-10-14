"""Email delivery utilities for NUVORA."""
import logging
import smtplib
from html import escape
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional

logger = logging.getLogger(__name__)


class EmailProvider:
    """Base email provider interface."""
    
    def send_email(
        self,
        to_email: str,
        subject: str,
        text_body: str,
        html_body: Optional[str] = None,
    ) -> bool:
        """Send an email. Returns True if successful, False otherwise."""
        raise NotImplementedError


class SMTPEmailProvider(EmailProvider):
    """SMTP-based email provider."""
    
    def __init__(
        self,
        smtp_host: str,
        smtp_port: int,
        smtp_user: str,
        smtp_password: str,
        from_email: str,
        from_name: str = "NUVORA",
        use_tls: bool = True,
    ):
        self.smtp_host = smtp_host
        self.smtp_port = smtp_port
        self.smtp_user = smtp_user
        self.smtp_password = smtp_password
        self.from_email = from_email
        self.from_name = from_name
        self.use_tls = use_tls
    
    def send_email(
        self,
        to_email: str,
        subject: str,
        text_body: str,
        html_body: Optional[str] = None,
    ) -> bool:
        """Send an email via SMTP."""
        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = f"{self.from_name} <{self.from_email}>"
            msg["To"] = to_email
            
            # Add text part
            msg.attach(MIMEText(text_body, "plain"))
            
            # Add HTML part if provided
            if html_body:
                msg.attach(MIMEText(html_body, "html"))
            
            # Send via SMTP
            if self.use_tls:
                with smtplib.SMTP(self.smtp_host, self.smtp_port, timeout=10) as server:
                    server.starttls()
                    server.login(self.smtp_user, self.smtp_password)
                    server.send_message(msg)
            else:
                with smtplib.SMTP(self.smtp_host, self.smtp_port, timeout=10) as server:
                    server.login(self.smtp_user, self.smtp_password)
                    server.send_message(msg)
            
            logger.info(f"Email sent successfully to {to_email}")
            return True
        
        except Exception as e:
            logger.error(f"Failed to send email to {to_email}: {e}")
            return False


class DisabledEmailProvider(EmailProvider):
    """Reject delivery when SMTP is not configured."""

    def send_email(
        self,
        to_email: str,
        subject: str,
        text_body: str,
        html_body: Optional[str] = None,
    ) -> bool:
        logger.error("Email delivery is disabled because SMTP is not configured")
        return False


def get_email_provider(
    smtp_host: Optional[str] = None,
    smtp_port: Optional[int] = None,
    smtp_user: Optional[str] = None,
    smtp_password: Optional[str] = None,
    from_email: Optional[str] = None,
    from_name: str = "NUVORA",
) -> EmailProvider:
    """Return SMTP delivery only when all required settings are present."""
    if all([smtp_host, smtp_port, smtp_user, smtp_password, from_email]):
        return SMTPEmailProvider(
            smtp_host=smtp_host,
            smtp_port=smtp_port,
            smtp_user=smtp_user,
            smtp_password=smtp_password,
            from_email=from_email,
            from_name=from_name,
            use_tls=True,
        )
    return DisabledEmailProvider()


def send_password_reset_email(
    provider: EmailProvider,
    to_email: str,
    reset_token: str,
    base_url: str,
    ttl_minutes: int,
) -> bool:
    """Send a password reset email with token."""
    reset_url = f"{base_url}/reset-password?token={reset_token}"
    
    subject = "Reset Your NUVORA Password"
    
    text_body = f"""
Hi,

You requested to reset your password for your NUVORA account.

Click the link below to reset your password:
{reset_url}

This link will expire in {ttl_minutes} minutes.

If you didn't request this, you can safely ignore this email.

Best,
The NUVORA Team
""".strip()
    
    safe_url = escape(reset_url, quote=True)
    html_body = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .button {{ display: inline-block; padding: 12px 24px; background-color: #0066cc; color: white; text-decoration: none; border-radius: 4px; margin: 20px 0; }}
        .footer {{ margin-top: 40px; font-size: 12px; color: #666; }}
    </style>
</head>
<body>
    <div class="container">
        <h2>Reset Your Password</h2>
        <p>You requested to reset your password for your NUVORA account.</p>
        <p>Click the button below to reset your password:</p>
        <a href="{safe_url}" class="button">Reset Password</a>
        <p><small>Or copy and paste this link into your browser:<br>{safe_url}</small></p>
        <p>This link will expire in {ttl_minutes} minutes.</p>
        <p>If you didn't request this, you can safely ignore this email.</p>
        <div class="footer">
            <p>Best,<br>The NUVORA Team</p>
        </div>
    </div>
</body>
</html>
""".strip()
    
    return provider.send_email(to_email, subject, text_body, html_body)
