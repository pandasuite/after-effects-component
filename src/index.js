import PandaBridge from "pandasuite-bridge";
import bodymovin from "lottie-web";
import "./index.css";

let properties = null;
let markers = null;

let animation = null;
let currentSpeed = 1;
let oldFrame = -1;
let nbLoop = 0;

let fromSynchro = false;

PandaBridge.init(() => {
  PandaBridge.onLoad((pandaData) => {
    properties = pandaData.properties;
    markers = pandaData.markers;

    if (document.readyState === "complete") {
      myInit();
    } else {
      document.addEventListener("DOMContentLoaded", myInit, false);
    }
  });

  function myInit() {
    const jsonUrl =
      PandaBridge.resolvePath("animationFolder", "./") +
      properties.animationPath;
    const loop =
      properties.loop === -1
        ? true
        : properties.loop === 0
        ? false
        : properties.loop + 1;
    nbLoop = properties.loop;

    animation = bodymovin.loadAnimation({
      container: document.getElementById("container"),
      renderer: PandaBridge.isStudio ? "canvas" : "svg",
      loop,
      autoplay: false,
      path: jsonUrl,
    });

    window.animation = animation;

    animation.addEventListener("data_ready", () => {
      /* Disable autoPlay in edition mode for convenience */
      if (properties.autoPlay && !PandaBridge.isStudio) {
        animation.play();
        PandaBridge.send("onStartingPlay");
      }

      triggerUpdatedData(PandaBridge.INITIALIZED);
    });

    animation.addEventListener("DOMLoaded", () => {
      sendScreenshot();
    });

    animation.addEventListener("enterFrame", onTimeUpdate);
    animation.addEventListener("loopComplete", () => {
      if (nbLoop > 0) {
        nbLoop -= 1;
      }
    });
    animation.addEventListener("complete", () => {
      /* BodyMovin use playCount for stopping the animation (refering to loop property) */
      /* We reset it to act like a new play */
      animation.playCount = -1;
      nbLoop = properties.loop;

      /* BodyMovin bug: it call loopComplete on the futur start without this two lines */
      fromSynchro = true;
      setFrame(0);

      PandaBridge.send("onFinishPlaying");
      triggerUpdatedData(PandaBridge.UPDATED, -1);
    });

    animation.setSpeed(properties.speed);
    currentSpeed = properties.speed;
  }

  PandaBridge.onUpdate((pandaData) => {
    properties = pandaData.properties;
    markers = pandaData.markers;

    if (currentSpeed !== properties.speed && animation) {
      animation.setSpeed(properties.speed);
      currentSpeed = properties.speed;
    }
  });

  /* Markers */

  PandaBridge.getSnapshotData(() => {
    if (!animation) {
      return null;
    }
    return { id: Math.round(animation.currentRawFrame) };
  });

  PandaBridge.setSnapshotData((pandaData) => {
    setFrame(parseInt(pandaData.data.id));

    if (pandaData.params && pandaData.params.isDefault) {
      requestAnimationFrame(() => {
        sendScreenshot();
      });
    }
  });

  /* Actions */

  PandaBridge.listen("playPause", () => {
    if (animation && animation.isPaused) {
      animation.play();
      PandaBridge.send("onStartingPlay");
    } else if (animation) {
      animation.pause();
      PandaBridge.send("onPausePlaying");
    }
  });

  PandaBridge.listen("play", () => {
    if (animation) {
      animation.play();
      PandaBridge.send("onStartingPlay");
    }
  });

  PandaBridge.listen("pause", () => {
    if (animation && !animation.isPaused) {
      animation.pause();
      PandaBridge.send("onPausePlaying");
    }
  });

  PandaBridge.listen("stop", () => {
    if (animation) {
      animation.stop();
      animation.playCount = 0;
      nbLoop = properties.loop;
      PandaBridge.send("onStoppingPlay");
      triggerUpdatedData(PandaBridge.UPDATED, -1);
    }
  });

  PandaBridge.listen("seek", (args) => {
    const props = args[0] || {};

    setFrame(
      Math.min(Math.max(parseInt(props.frame), 0), animation.totalFrames - 1),
    );
  });

  PandaBridge.listen("forward", (args) => {
    const props = args[0] || {};

    setFrame(
      Math.min(
        animation.currentRawFrame + parseInt(props.frame),
        animation.totalFrames - 1,
      ),
    );
  });

  PandaBridge.listen("rewind", (args) => {
    const props = args[0] || {};

    setFrame(Math.max(animation.currentRawFrame - parseInt(props.frame), 0));
  });

  PandaBridge.listen("restartFromBeginning", () => {
    if (animation) {
      animation.goToAndPlay(0);
    }
  });

  PandaBridge.listen("setSpeed", (args) => {
    const props = args[0] || {};

    if (animation) {
      animation.setSpeed(parseFloat(props.speed));
    }
  });

  PandaBridge.listen("increaseSpeed", (args) => {
    const props = args[0] || {};

    if (animation) {
      const speed = Math.min(
        currentSpeed + parseFloat(props.speed),
        properties.maxSpeed,
      );
      animation.setSpeed(speed);
      currentSpeed = speed;
    }
  });

  PandaBridge.listen("decreaseSpeed", (args) => {
    const props = args[0] || {};

    if (animation) {
      const speed = Math.max(
        currentSpeed - parseFloat(props.speed),
        properties.minSpeed,
      );
      animation.setSpeed(speed);
      currentSpeed = speed;
    }
  });

  PandaBridge.synchronize("frame", (percent) => {
    if (animation) {
      fromSynchro = true;

      let additionalFrames = 0;
      if (properties.loop !== -1) {
        nbLoop =
          properties.loop - Math.floor(percent / (100 / (properties.loop + 1)));
        additionalFrames = properties.loop * animation.totalFrames;
      }
      setFrame(
        ((percent * (animation.totalFrames - 1 + additionalFrames)) / 100) %
          animation.totalFrames,
      );
    }
  });

  PandaBridge.synchronize("speed", (percent) => {
    if (animation) {
      animation.setSpeed(
        ((properties.maxSpeed - properties.minSpeed) * percent) / 100 +
          properties.minSpeed,
      );
    }
  });

  /* Private methods */

  function setFrame(frame) {
    if (!animation) {
      return;
    }

    if (animation.playCount === -1) {
      animation.playCount = 0;
    }
    animation.setCurrentRawFrameValue(frame);
  }

  function onTimeUpdate() {
    const currentFrame = animation.currentRawFrame;

    if (oldFrame !== currentFrame) {
      triggerUpdatedData(PandaBridge.UPDATED);
    }

    /* Markers */
    if (markers) {
      markers.forEach((marker) => {
        if (
          isValueInRange(
            marker.id,
            currentFrame,
            oldFrame,
            0,
            animation.totalFrames - 1,
          )
        ) {
          PandaBridge.send("triggerMarker", marker.id);
        }
      });
    }

    /* Synchronisation status */
    if (!fromSynchro) {
      let percent =
        (parseInt(animation.currentRawFrame) * 100) /
        (animation.totalFrames - 1);
      if (properties.loop !== -1) {
        percent =
          ((parseInt(animation.currentRawFrame) +
            (properties.loop - nbLoop) * animation.totalFrames) *
            100) /
          (animation.totalFrames + properties.loop * animation.totalFrames - 1);
      }
      PandaBridge.send("synchronize", [percent, "frame", true]);
    } else {
      fromSynchro = false;
    }

    oldFrame = currentFrame;
  }

  function isValueInRange(
    testValue,
    currentValue,
    oldValue,
    minBorder,
    maxBorder,
  ) {
    const minvalue = Math.min(oldValue, currentValue);
    const maxvalue = Math.max(oldValue, currentValue);

    const isLooping =
      Math.abs(oldValue - currentValue) > (maxBorder - minBorder) * 0.85 &&
      oldValue !== -1;
    return (
      (isLooping &&
        ((testValue > maxvalue && testValue <= maxBorder) ||
          (testValue >= minBorder && testValue <= minvalue))) ||
      (!isLooping &&
        ((oldValue <= currentValue &&
          testValue > minvalue &&
          testValue <= maxvalue) ||
          (oldValue > currentValue &&
            testValue >= minvalue &&
            testValue < maxvalue)))
    );
  }

  function triggerUpdatedData(eventName, currentSeek) {
    if (PandaBridge.isStudio) {
      // eslint-disable-next-line no-param-reassign
      currentSeek = currentSeek || animation.currentRawFrame;
      PandaBridge.send(eventName, {
        controls: [
          {
            id: "controlBar",
            value: {
              minSeek: 0,
              maxSeek: animation.totalFrames,
              currentSeek,
            },
          },
        ],
      });
    }
  }

  function sendScreenshot() {
    if (PandaBridge.isStudio) {
      const canvas = document.querySelector("canvas");

      if (canvas) {
        PandaBridge.send(PandaBridge.SCREENSHOT_RESULT, [
          canvas.toDataURL("image/png"),
        ]);
      }
    }
  }
});
