import AnimatedButton from "./AnimatedButton";

const AnimatedUpdateButton = (props: any) => {
  return (
    <AnimatedButton
      onClick={props.onUpdateAll}
      defaultText="Update ALL"
      loadingText="Updating..."
      successText="Finish!"
      tooltip="Update All Packages"
      initialState="circle"
    />
  );
};

export default AnimatedUpdateButton;
