from allauth.socialaccount.adapter import DefaultSocialAccountAdapter
from allauth.socialaccount.models import SocialAccount
from allauth.account.utils import perform_login
from django.contrib.auth import get_user_model

User = get_user_model()

class CustomSocialAccountAdapter(DefaultSocialAccountAdapter):
    def pre_social_login(self, request, sociallogin):
        if sociallogin.is_existing:
            return

        email = sociallogin.user.email or None
        if not email:
            return

        try:
            existing_user = User.objects.get(email__iexact=email)
        except User.DoesNotExist:
            return

        sociallogin.connect(request, existing_user)

        perform_login(request, existing_user, email_verification='optional')
        return

    def is_open_for_signup(self, request, sociallogin):
        return True
