import React from 'react';
import { Link } from 'wouter';

export const FooterNav: React.FC = () => {
  return (
    <footer className="mt-12 w-full border-t border-border/70 bg-background/80 px-4 py-8 text-muted-foreground">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 md:flex-row">
        <div className="text-sm">
          © 2021 - {new Date().getFullYear()} <strong className="text-foreground">North State Blockchain</strong>. All rights reserved.
        </div>
        <div className="flex flex-wrap justify-center gap-6 text-sm">
          <Link href="/about" className="transition-colors hover:text-foreground">About Us</Link>
          <Link href="/terms" className="transition-colors hover:text-foreground">Terms of Service</Link>
          <Link href="/privacy" className="transition-colors hover:text-foreground">Privacy Policy</Link>
          <Link href="/faq" className="transition-colors hover:text-foreground">FAQ</Link>
        </div>
      </div>
    </footer>
  );
};
