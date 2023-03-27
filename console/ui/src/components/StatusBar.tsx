import { State } from "@wingconsole/server";
import classNames from "classnames";

import { Loader } from "../design-system/Loader.js";

import { AutoUpdater } from "./auto-updater.js";

export interface StatusBarProps {
  wingVersion?: string;
  cloudAppState: State;
  isError?: boolean;
}

export const StatusBar = ({
  wingVersion = "",
  cloudAppState,
  isError = false,
}: StatusBarProps) => {
  return (
    <footer className="bg-slate-50 py-1 px-4 flex text-2xs w-full text-slate-500 relative border-t border-slate-300">
      {/*left side*/}
      <div className="w-full flex space-x-6">
        <div title={wingVersion} className="truncate space-x-1 min-w-[7rem]">
          <span>Wing version:</span>
          <span className="text-slate-600">{wingVersion}</span>
        </div>

        <div className="flex space-x-1">
          <span>Status:</span>
          <span className="text-slate-600">
            <span
              className={classNames([
                isError ? "text-red-500" : "text-slate-600",
                "flex",
              ])}
            >
              {cloudAppState === "loading" && <Loader size="1rem" />}
              {cloudAppState}
            </span>
          </span>
        </div>
      </div>
      {/*right side*/}
      <div className="w-full flex space-x-0 justify-end">
        <AutoUpdater />
      </div>
    </footer>
  );
};
