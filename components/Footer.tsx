interface Props {
  footerMessage: string;
  supportPhone: string | null;
  configVersion: string | null;
}

export default function Footer({ footerMessage, supportPhone, configVersion }: Props) {
  return (
    <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 py-6 mt-6">
      <div className="max-w-screen-xl mx-auto px-4">
        <div className="flex flex-col sm:flex-row justify-center gap-6 mb-4 text-sm text-slate-600 dark:text-slate-400">
          <div className="flex items-center gap-2">
            <i className="fa-brands fa-github text-slate-600 dark:text-slate-400" />
            <a
              href="https://github.com/brandonsanders48/simple-status-page"
              target="_blank"
              rel="noopener"
              className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
            >
              GitHub
            </a>
          </div>
          <div className="flex items-center gap-2">
            <i className="fa-solid fa-bug text-slate-500 dark:text-slate-500" />
            <a
              href="https://github.com/brandonsanders48/simple-status-page/issues/new"
              title="Requires login to GitHub"
              target="_blank"
              rel="noopener"
              className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
            >
              Submit Issue
            </a>
          </div>
          {supportPhone && (
            <div className="flex items-center gap-2">
              <i className="fa-solid fa-phone text-slate-500 dark:text-slate-500" />
              <span>{supportPhone}</span>
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row justify-center items-center gap-3 text-xs text-slate-500 dark:text-slate-400 border-t border-slate-200 dark:border-slate-800 pt-4">
          {footerMessage && <span>{footerMessage}</span>}
          {configVersion && (
            <span>
              {footerMessage && <span className="text-slate-400 dark:text-slate-600 mr-3">•</span>}
              Config v{configVersion}
            </span>
          )}
        </div>
      </div>
    </footer>
  );
}
