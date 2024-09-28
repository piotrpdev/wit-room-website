<script lang="ts">
export let userPattern: string;
export let userRoom: string;
export let userChoice: string;

export let allRooms: HTMLOptionElement[];
</script>

<fieldset>
    <legend>Which rooms to check?</legend>
    <div id="fields">
      <div>
        <input type="radio" id="it-rooms" name="room-choice" bind:group={userChoice} value="it-rooms" />
        <label for="it-rooms">IT Rooms</label>
      </div>

      <div>
        <input type="radio" id="use-pattern" name="room-choice" bind:group={userChoice} value="use-pattern" />
        <label for="use-pattern">
          <label for="pattern">Pattern</label>
          <input type="text" id="pattern" name="pattern" size="5" bind:value={userPattern} />
        </label>
      </div>

      <div>
        <input type="radio" id="use-room" name="room-choice" bind:group={userChoice} value="use-room" />
        <label for="use-room">
          <label for="room">Room</label>
          <select bind:value={userRoom} name="room" id="room">
            {#each allRooms as room}
              <option value={room.value}>{room.label}</option>
            {/each}
          </select>
        </label>
      </div>
    </div>
</fieldset>

<style>
  fieldset {
    display: flex;
    flex-direction: column;
    align-items: center;
    margin: 6px 0px 0px 0px;
    width: fit-content;
    border-radius: 5px;
    border-color: var(--table-border);
  }
  #fields {
    display: flex;
    flex-direction: column;
    gap: 1em;
    margin: 12px;
  }
  #fields > div {
    display: flex;
    gap: 0.5em;
    width: fit-content;
  }
  #fields #room, #fields #pattern {
    margin-left: 0.5em;
    max-width: 10em;
  }
</style>
