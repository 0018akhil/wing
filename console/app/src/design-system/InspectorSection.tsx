import { ForwardRefExoticComponent, PropsWithChildren, SVGProps } from "react";

import { InspectorSectionHeading } from "./InspectorSectionHeading.js";

export interface InspectorSectionProps {
  open?: boolean;
  text: string;
  icon?: ForwardRefExoticComponent<SVGProps<SVGSVGElement>>;
  onClick?: () => void;
  subection?: boolean;
}

export const InspectorSection = ({
  open,
  text,
  icon,
  onClick,
  children,
  subection = false,
}: PropsWithChildren<InspectorSectionProps>) => {
  return (
    <>
      <InspectorSectionHeading
        text={text}
        icon={icon}
        open={open}
        onClick={onClick}
        subection={subection}
      />
      {open && children}
    </>
  );
};
